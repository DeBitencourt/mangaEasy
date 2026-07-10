import { parse } from 'node-html-parser';

export interface ScrapedManga {
  title: string;
  coverUrl: string;
  synopsis: string;
  chapters: string[];
  chapterUrls: Record<string, string>;
  mangaType?: string;
}

const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9,pt-BR;q=0.8,pt;q=0.7',
  'Cache-Control': 'no-cache',
};

/**
 * Normalizes manga and chapter URLs for consistency (forcing www. and trailing slashes for mangaread.org)
 */
export function normalizeMangaUrl(url: string): string {
  if (!url) return '';
  let targetUrl = url.trim();
  if (!targetUrl.toLowerCase().startsWith('http://') && !targetUrl.toLowerCase().startsWith('https://')) {
    throw new Error('A URL inserida é inválida. Ela deve começar com http:// ou https://');
  }
  if (targetUrl.includes('mangaread.org') && !targetUrl.includes('www.mangaread.org')) {
    targetUrl = targetUrl.replace('mangaread.org', 'www.mangaread.org');
  }
  if ((targetUrl.includes('/manga/') || targetUrl.includes('/chapter/')) && !targetUrl.endsWith('/')) {
    targetUrl = targetUrl + '/';
  }
  return targetUrl;
}

/**
 * Normalizes URLs to be absolute
 */
function normalizeUrl(url: string, baseUrl: string): string {
  if (!url) return '';
  let cleanUrl = url.trim();
  if (cleanUrl.startsWith('//')) {
    return `https:${cleanUrl}`;
  }
  if (cleanUrl.startsWith('/')) {
    try {
      const parsedBase = new URL(baseUrl);
      return `${parsedBase.origin}${cleanUrl}`;
    } catch {
      return cleanUrl;
    }
  }
  return cleanUrl;
}

/**
 * Strips WordPress image dimension suffixes (e.g. -193x278) to get the original high-resolution image
 */
export function getHighResImageUrl(url: string): string {
  if (!url) return '';
  return url.replace(/-\d+x\d+(\.\w+)$/, '$1');
}



/**
 * Fetch HTML helper with fake browser headers
 */
async function fetchHtml(url: string): Promise<string> {
  const targetUrl = normalizeMangaUrl(url);



  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    console.warn(`[DEBUG] fetchHtml timed out for URL: ${targetUrl}`);
    controller.abort();
  }, 10000); // 10 seconds timeout

  try {
    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        ...DEFAULT_HEADERS,
        'Referer': targetUrl,
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Erro de rede (${response.status}): Não foi possível carregar a página.`);
    }

    // Check if we were redirected to the home page (indicates wrong slug / invalid manga page)
    const finalUrl = response.url;
    if (finalUrl) {
      try {
        const finalUrlObj = new URL(finalUrl);
        const isOriginalMangaOrChapter = url.includes('/manga/') || url.includes('/chapter/');
        const landedOnHomepage = finalUrlObj.pathname === '/' || finalUrlObj.pathname === '';
        if (isOriginalMangaOrChapter && landedOnHomepage) {
          throw new Error('Mangá não encontrado. A URL redirecionou para a página inicial.');
        }
      } catch (err) {
        if (err instanceof Error && err.message.includes('inicial')) {
          throw err;
        }
      }
    }

    return await response.text();
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error('Tempo limite da requisição esgotado (timeout de 10s).');
    }
    throw err;
  }
}


/**
 * Helper to clean and format chapter titles (e.g., extracting "Capítulo 262" from "Chapter 2624 days ago")
 */
export function cleanChapterTitle(title: string, chNumber?: number | string): string {
  if (!title) return '';
  let clean = title.trim();
  clean = clean.replace(/\s+/g, ' ');

  // Normalize "First Chapter" or "Primeiro Capítulo" to "Capítulo X"
  if (/^first chapter$/i.test(clean) || /^primeiro cap[íi]tulo$/i.test(clean)) {
    return chNumber !== undefined ? `Capítulo ${chNumber}` : 'Capítulo 1';
  }

  // Remove trailing date/time indicators like "3 days ago", "12 hours ago", "2 mins ago", "1 week ago"
  // We match a standalone 1- or 2-digit number (\b\d{1,2}) followed by relative date keywords at the end of the string.
  clean = clean.replace(/\b\d{1,2}\s*(days?|hours?|mins?|weeks?|months?|years?|ago)\b/gi, '');
  clean = clean.replace(/\b(yesterday|last week|last month|a day ago|an hour ago)\b/gi, '');
  clean = clean.replace(/\b\d{2}[\./-]\d{2}[\./-]\d{4}\b/g, '');
  clean = clean.replace(/\b\d{4}[\./-]\d{2}[\./-]\d{2}\b/g, '');
  clean = clean.trim();

  // Matches "Chapter 262", "Capítulo 262", etc. followed by numbers and optional decimals
  const regex = /^(Chapter|Capítulo|Cap|Ch|Capitulo)\s*(\d+(?:\.\d+)?)/i;
  const match = clean.match(regex);
  if (match) {
    return `Capítulo ${match[2]}`;
  }
  return clean;
}

/**
 * Parses chapter nodes to extract title and url
 */
function parseChapterLinks(html: string, baseUrl: string): { titles: string[]; urls: Record<string, string> } {
  const root = parse(html);
  const links: { title: string; url: string }[] = [];

  // Try standard selectors
  const selectors = [
    'li.wp-manga-chapter a',
    '.wp-manga-chapter a',
    '.chapter-item a',
    '.row-content-chapter li a',
    '.eph-num a',
    '.listing-chapters_wrap a'
  ];

  for (const selector of selectors) {
    const elements = root.querySelectorAll(selector);
    if (elements.length > 0) {
      elements.forEach((el) => {
        const href = el.getAttribute('href');
        let text = '';
        if (el.childNodes.length > 0) {
          text = el.childNodes.map(node => node.textContent?.trim()).filter(Boolean).join(' ');
        } else {
          text = el.textContent?.trim() || '';
        }
        if (href && text) {
          links.push({
            title: cleanChapterTitle(text),
            url: normalizeUrl(href, baseUrl)
          });
        }
      });
      break;
    }
  }

  // Fallback: search all <a> tags for chapter patterns in href
  if (links.length === 0) {
    const allLinks = root.querySelectorAll('a');
    allLinks.forEach((el) => {
      const href = el.getAttribute('href');
      let text = '';
      if (el.childNodes.length > 0) {
        text = el.childNodes.map(node => node.textContent?.trim()).filter(Boolean).join(' ');
      } else {
        text = el.textContent?.trim() || '';
      }
      if (href && text) {
        const hrefLower = href.toLowerCase();
        const isChapterLink = 
          hrefLower.includes('/chapter/') ||
          hrefLower.includes('/chapter-') ||
          hrefLower.includes('/chapter_') ||
          hrefLower.includes('-chapter-') ||
          hrefLower.includes('/chap-') ||
          hrefLower.includes('/capitulo-') ||
          hrefLower.includes('/cap-');
        
        const isMangaRoute = hrefLower.includes('/manga/') || hrefLower.includes('/comics/');
        
        if (isChapterLink && (isMangaRoute || href.startsWith('http') || href.startsWith('/'))) {
          // Avoid duplicate main manga pages or lists
          if (!hrefLower.endsWith('/manga/') && !hrefLower.endsWith('/manga') && !hrefLower.endsWith('/comics') && !hrefLower.endsWith('/comics/')) {
            links.push({
              title: cleanChapterTitle(text),
              url: normalizeUrl(href, baseUrl)
            });
          }
        }
      }
    });
  }

  // Deduplicate and maintain order
  const seenUrls = new Set<string>();
  const seenTitles = new Set<string>();
  const uniqueLinks: typeof links = [];
  links.forEach(lnk => {
    const normTitle = lnk.title.trim().toLowerCase();
    if (!seenUrls.has(lnk.url) && !seenTitles.has(normTitle)) {
      seenUrls.add(lnk.url);
      seenTitles.add(normTitle);
      uniqueLinks.push(lnk);
    }
  });

  const titles = uniqueLinks.map(l => l.title);
  const urls: Record<string, string> = {};
  uniqueLinks.forEach(l => {
    urls[l.title] = l.url;
  });

  return { titles, urls };
}

/**
 * Fetches manga details from any supported source
 */
export async function fetchMangaDetailsReal(url: string, source: string): Promise<ScrapedManga> {
  if (source === 'mangadex.org' || url.includes('mangadex.org')) {
    try {
      const mangaId = url.split('/title/')[1]?.split('/')[0];
      if (!mangaId) {
        throw new Error('ID do MangaDex não pôde ser extraído da URL.');
      }
      
      const allCh = await fetchMangaDexChapters(mangaId);
      const queryUrl = `https://api.mangadex.org/manga/${mangaId}?includes[]=cover_art`;
      const response = await fetch(queryUrl, { headers: { 'Accept': 'application/json' } });
      if (!response.ok) {
        throw new Error(`Erro ao obter detalhes do MangaDex (status ${response.status})`);
      }
      const json = await response.json();
      const manga = json.data;
      const title = manga.attributes.title.en || Object.values(manga.attributes.title)[0] || 'MangaDex Title';
      const synopsis = manga.attributes.description.en || Object.values(manga.attributes.description)[0] || '';
      
      const coverArtRel = manga.relationships?.find((r: any) => r.type === 'cover_art');
      const fileName = coverArtRel?.attributes?.fileName;
      let coverUrl = 'https://images.unsplash.com/photo-1541701494587-cb58502866ab?w=400&q=80';
      if (fileName) {
        coverUrl = `https://uploads.mangadex.org/covers/${mangaId}/${fileName}`;
      }

      return {
        title,
        coverUrl,
        synopsis,
        chapters: allCh.chapters,
        chapterUrls: allCh.chapterUrls,
        mangaType: 'Manga',
      };
    } catch (err: any) {
      console.warn('[DEBUG] MangaDex fetchMangaDetailsReal error:', err.message);
      throw err;
    }
  }

  const normalizedUrl = normalizeMangaUrl(url);

  const isNovelBuddy = normalizedUrl.includes('novelbuddy.com') || normalizedUrl.includes('novelbuddy.io');

  if (isNovelBuddy) {
    const html = await fetchHtml(normalizedUrl);
    const root = parse(html);
    const origin = new URL(normalizedUrl).origin;

    let title = '';
    const ogTitle = root.querySelector('meta[property="og:title"]')?.getAttribute('content');
    if (ogTitle) {
      title = ogTitle.split(' - ')[0].split(' | ')[0].trim();
    }
    if (!title) {
      title = root.querySelector('h1, h3.title, title')?.textContent?.split(' - ')[0].split(' | ')[0].trim() || 'Novel Desconhecida';
    }

    let coverUrl = '';
    const ogImage = root.querySelector('meta[property="og:image"]')?.getAttribute('content');
    if (ogImage) coverUrl = normalizeUrl(ogImage, normalizedUrl);
    if (!coverUrl) {
      const img = root.querySelector('.book img, .novel-cover img, .book-img img, img.cover, .summary_image img');
      const src = img?.getAttribute('data-src') || img?.getAttribute('src');
      if (src) coverUrl = normalizeUrl(src, normalizedUrl);
    }
    if (!coverUrl) {
      coverUrl = 'https://images.unsplash.com/photo-1541701494587-cb58502866ab?w=400&q=80';
    }

    let synopsis = '';
    const ogDesc = root.querySelector('meta[property="og:description"]')?.getAttribute('content');
    if (ogDesc) synopsis = ogDesc.trim();
    if (!synopsis || synopsis.length < 5) {
      const paragraphs = root.querySelectorAll('.desc-text p, .description p, .synopsis p, .summary p, #description p');
      synopsis = paragraphs.map(p => p.textContent?.trim()).filter(Boolean).join('\n');
    }
    if (!synopsis) {
      synopsis = 'Nenhuma sinopse disponível para esta novel.';
    }

    let titles: string[] = [];
    let urls: Record<string, string> = {};

    const isCleanChapter = (text: string): boolean => {
      const lower = text.toLowerCase();
      return !(
        lower.includes('read from start') ||
        lower.includes('read first') ||
        lower.includes('read last') ||
        lower.includes('latest release') ||
        lower.includes('next chapter') ||
        lower.includes('previous chapter')
      );
    };

    // Specific helper to find novelId/bookId in the Next.js pageProps JSON
    const findIdInObject = (obj: any): string | null => {
      if (!obj || typeof obj !== 'object') return null;
      
      // Try specific keys on the object directly first
      const novelInfo = obj.novel || obj.manga || obj.book || {};
      if (novelInfo.id) return String(novelInfo.id);
      if (novelInfo.bookId) return String(novelInfo.bookId);

      if (obj.novelId) return String(obj.novelId);
      if (obj.bookId) return String(obj.bookId);
      if (obj.mangaId) return String(obj.mangaId);

      // Safe fallback if the object itself represents the book/manga detail
      if (obj.id && (obj.synopsis || obj.description || obj.author || obj.cover || obj.coverUrl || obj.genres)) {
        return String(obj.id);
      }

      // Traversal as fallback, but ignore chapter/latest sub-objects to avoid picking chapter IDs
      const keys = Object.keys(obj);
      for (const k of keys) {
        if (k.toLowerCase().includes('chapter') || k.toLowerCase().includes('latest') || k.toLowerCase().includes('recent')) {
          continue;
        }
        const found = findIdInObject(obj[k]);
        if (found) return found;
      }
      return null;
    };

    // Recursive helper to find all chapter-like arrays inside the Next.js pageProps JSON
    const findAllChaptersInObject = (obj: any, foundArrays: any[][] = []): any[][] => {
      if (!obj || typeof obj !== 'object') return foundArrays;
      
      if (Array.isArray(obj)) {
        if (obj.length > 0) {
          const first = obj[0];
          if (first && typeof first === 'object') {
            const keys = Object.keys(first).map(k => k.toLowerCase());
            if (keys.some(k => k.includes('title') || k.includes('name') || k.includes('slug') || k.includes('href') || k === 'id')) {
              if (!keys.some(k => k === 'genre' || k === 'author')) {
                foundArrays.push(obj);
              }
            }
          }
        }
      } else {
        const keys = Object.keys(obj);
        for (const key of keys) {
          findAllChaptersInObject(obj[key], foundArrays);
        }
      }
      return foundArrays;
    };

    // 1. Primary: Extract ID and attempt fetching the full chapter list via AJAX API
    let novelId = '';
    let nextDataObj: any = null;
    const nextDataMatch = html.match(/<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
    
    if (nextDataMatch) {
      try {
        nextDataObj = JSON.parse(nextDataMatch[1]);
        const extractedId = findIdInObject(nextDataObj?.props?.pageProps);
        if (extractedId) {
          novelId = extractedId;
        }
      } catch (e) {
        // ignore
      }
    }

    if (!novelId) {
      const match = html.match(/var\s+bookId\s*=\s*(\d+)/) ||
                    html.match(/window\.bookId\s*=\s*(\d+)/) ||
                    html.match(/bookId\s*=\s*(\d+)/) ||
                    html.match(/var\s+novelId\s*=\s*(\d+)/) ||
                    html.match(/window\.novelId\s*=\s*(\d+)/) ||
                    html.match(/data-id=["'](\d+)["']/);
      if (match && match[1]) {
        novelId = match[1];
      }
    }

    if (novelId) {
      try {
        const ajaxResponse = await fetch(`https://api.novelbuddy.com/titles/${novelId}/chapters?cv=${Date.now()}`, {
          method: 'GET',
          headers: {
            ...DEFAULT_HEADERS,
            'Referer': normalizedUrl,
            'Origin': 'https://novelbuddy.com'
          },
        });
        if (ajaxResponse.ok) {
          const json = await ajaxResponse.json();
          const chapters = json?.data?.chapters;
          if (Array.isArray(chapters)) {
            chapters.forEach((ch: any, index: number) => {
              const text = ch.name || ch.title || `Capítulo ${index + 1}`;
              const href = ch.url || ch.slug;
              if (href && isCleanChapter(text)) {
                const cleanTitle = cleanChapterTitle(text, index + 1);
                if (!titles.includes(cleanTitle)) {
                  titles.push(cleanTitle);
                  urls[cleanTitle] = normalizeUrl(href, normalizedUrl);
                }
              }
            });
          }
        }
      } catch (e) {
        console.warn('NovelBuddy AJAX error:', e);
      }
    }

    // 2. Secondary: If AJAX API yielded no chapters, search if they are embedded in NEXT_DATA JSON
    if (titles.length === 0 && nextDataObj) {
      try {
        const allArrays = findAllChaptersInObject(nextDataObj.props?.pageProps);
        if (allArrays.length > 0) {
          // Sort arrays in descending order of length to choose the longest list (the full chapters list)
          allArrays.sort((a, b) => b.length - a.length);
          const foundChapters = allArrays[0];
          
          foundChapters.forEach((ch: any, idx: number) => {
            const text = ch.title || ch.name || ch.chapterName || ch.chapterTitle || `Capítulo ${idx + 1}`;
            const slug = ch.slug || ch.href || ch.url || ch.chapterSlug || ch.id;
            if (text && slug && isCleanChapter(text)) {
              const href = slug.startsWith('/') || slug.startsWith('http') ? slug : `/${slug}`;
              const cleanTitle = cleanChapterTitle(text, idx + 1);
              if (!titles.includes(cleanTitle)) {
                titles.push(cleanTitle);
                urls[cleanTitle] = normalizeUrl(href, normalizedUrl);
              }
            }
          });
        }
      } catch (e) {
        // ignore
      }
    }

    // 3. Fallback: Parse directly from HTML anchors if both AJAX and JSON extraction yielded nothing
    if (titles.length === 0) {
      const pageAnchors = root.querySelectorAll('a[href*="/chapter-"]');
      pageAnchors.forEach((el, index) => {
        const href = el.getAttribute('href');
        if (href) {
          const textSpan = el.querySelector('span.text-\\[13\\.5px\\], span[class*="text-fg"], span[class*="group-hover:text-accent"]');
          const text = textSpan?.textContent?.trim() || el.textContent?.trim() || `Capítulo ${index + 1}`;
          if (isCleanChapter(text)) {
            const cleanTitle = cleanChapterTitle(text, index + 1);
            if (!titles.includes(cleanTitle)) {
              titles.push(cleanTitle);
              urls[cleanTitle] = normalizeUrl(href, normalizedUrl);
            }
          }
        }
      });
    }

    const sortedTitles = [...titles].sort((a, b) => {
      const numA = parseFloat(a.match(/\d+(?:\.\d+)?/)?.[0] || '0');
      const numB = parseFloat(b.match(/\d+(?:\.\d+)?/)?.[0] || '0');
      return numB - numA;
    });

    return {
      title,
      coverUrl,
      synopsis,
      chapters: sortedTitles,
      chapterUrls: urls,
      mangaType: 'Novel',
    };
  }

  const html = await fetchHtml(normalizedUrl);
  const root = parse(html);
  const origin = new URL(normalizedUrl).origin;

  // 1. Extract Title
  let title = '';
  const ogTitle = root.querySelector('meta[property="og:title"]')?.getAttribute('content');
  if (ogTitle) {
    title = ogTitle.split(' - ')[0].split(' | ')[0].trim();
  }
  if (!title) {
    const twitterTitle = root.querySelector('meta[name="twitter:title"]')?.getAttribute('content');
    if (twitterTitle) title = twitterTitle.trim();
  }
  if (!title) {
    title = root.querySelector('title')?.textContent?.split(' - ')[0].split(' | ')[0].trim() || 'Mangá Desconhecido';
  }

  // Robust validation: check if we are on a home page or index page instead of detail page
  const isAsura = url.includes('asura') || source.includes('asura');
  const hasMangaElements = root.querySelector('.summary_image, .tab-summary, .manga-info-row, li.wp-manga-chapter, .post-title, .post-title h1') || (isAsura && (root.querySelector('h1') || html.includes('ChapterListReact')));
  if (title.toUpperCase() === 'HOME' || title.toLowerCase().includes('read manga online free') || !hasMangaElements) {
    throw new Error('Link inválido. A URL fornecida não aponta para um mangá real (redirecionado para a página inicial).');
  }

  // 2. Extract Cover Image
  let coverUrl = '';
  const ogImage = root.querySelector('meta[property="og:image"]')?.getAttribute('content');
  if (ogImage) coverUrl = normalizeUrl(ogImage, normalizedUrl);
  
  if (!coverUrl) {
    const mangaImg = root.querySelector('.summary_image img, .manga-image img, .post-thumbnail img, img.wp-post-image');
    const src = mangaImg?.getAttribute('data-src') || mangaImg?.getAttribute('src');
    if (src) coverUrl = normalizeUrl(src, normalizedUrl);
  }
  if (!coverUrl) {
    coverUrl = 'https://images.unsplash.com/photo-1541701494587-cb58502866ab?w=400&q=80'; // fallback
  }

  // 3. Extract Synopsis
  let synopsis = '';
  const ogDesc = root.querySelector('meta[property="og:description"]')?.getAttribute('content');
  if (ogDesc) synopsis = ogDesc.trim();
  
  if (!synopsis || synopsis.length < 5) {
    const paragraphs = root.querySelectorAll('.summary-content p, .manga-about p, .description-summary p, .post-content p');
    synopsis = paragraphs.map(p => p.textContent?.trim()).filter(Boolean).join('\n');
  }
  if (!synopsis) {
    synopsis = 'Nenhuma sinopse disponível para este mangá.';
  }

  // 4. Extract Chapters
  let { titles, urls } = parseChapterLinks(html, normalizedUrl);

  // If no chapters found and it's Asura Scans, parse from Astro props
  if (titles.length === 0 && isAsura) {
    const matches = html.matchAll(/props="([^"]+)"/g);
    
    // Recursive helper to unwrap Astro serialized props
    const unwrapAstroProp = (val: any): any => {
      if (Array.isArray(val)) {
        if (val.length === 2 && val[0] === 0) {
          return unwrapAstroProp(val[1]);
        }
        if (val.length === 2 && val[0] === 1) {
          return val[1].map(unwrapAstroProp);
        }
        return val.map(unwrapAstroProp);
      }
      if (typeof val === 'object' && val !== null) {
        const res: any = {};
        for (const k in val) {
          res[k] = unwrapAstroProp(val[k]);
        }
        return res;
      }
      return val;
    };

    for (const match of matches) {
      try {
        const decoded = match[1].replace(/&quot;/g, '"');
        const parsed = JSON.parse(decoded);
        const unwrapped = unwrapAstroProp(parsed);
        const chaptersList = unwrapped.chapters || [];
        if (Array.isArray(chaptersList) && chaptersList.length > 0) {
          const cleanBaseUrl = normalizedUrl.endsWith('/') ? normalizedUrl.slice(0, -1) : normalizedUrl;
          chaptersList.forEach((ch: any) => {
            if (ch && ch.number !== undefined) {
              const chTitle = ch.title || `Capítulo ${ch.number}`;
              const cleanTitle = cleanChapterTitle(chTitle, ch.number);
              const chUrl = `${cleanBaseUrl}/chapter/${ch.number}`;
              if (!titles.includes(cleanTitle)) {
                titles.push(cleanTitle);
                urls[cleanTitle] = chUrl;
              }
            }
          });
        }
      } catch (err) {
        // ignore
      }
    }
  }

  // If no chapters found, try WordPress AJAX fallback
  if (titles.length === 0) {
    // Try to extract post manga ID
    const mangaIdMatch = 
      html.match(/manga_id\s*:\s*["']?(\d+)["']?/i) || 
      html.match(/data-id=["'](\d+)["']/i) || 
      html.match(/post-(\d+)/i) || 
      html.match(/wp-manga-js-extra[\s\S]*?manga_id\s*:\s*["']?(\d+)["']?/i);

    if (mangaIdMatch && mangaIdMatch[1]) {
      const mangaId = mangaIdMatch[1];
      try {
        const ajaxResponse = await fetch(`${origin}/wp-admin/admin-ajax.php`, {
          method: 'POST',
          headers: {
            ...DEFAULT_HEADERS,
            'Content-Type': 'application/x-www-form-urlencoded',
            'Referer': normalizedUrl,
          },
          body: `action=manga_get_chapters&manga=${mangaId}`,
        });

        if (ajaxResponse.ok) {
          const ajaxHtml = await ajaxResponse.text();
          const parsedAjax = parseChapterLinks(ajaxHtml, normalizedUrl);
          if (parsedAjax.titles.length > 0) {
            titles = parsedAjax.titles;
            urls = parsedAjax.urls;
          }
        }
      } catch (e) {
        // ignore AJAX error and keep empty list
      }
    }
  }

  // 5. Extract Type (Manga, Manhwa, Manhua)
  let mangaType = 'Manga';
  if (isAsura) {
    mangaType = 'Manhwa';
  } else {
    const contentItems = root.querySelectorAll('.post-content_item');
    for (const item of contentItems) {
      const heading = item.querySelector('.summary-heading')?.textContent?.trim().toLowerCase();
      if (heading && (heading.includes('type') || heading.includes('tipo'))) {
        const value = item.querySelector('.summary-content')?.textContent?.trim();
        if (value) {
          mangaType = value.replace(/\s+/g, ' ').trim();
          break;
        }
      }
    }

    // Fallback: check links containing /manga-type/ in href
    if (mangaType.toLowerCase() === 'manga') {
      const typeLink = root.querySelector('a[href*="/manga-type/"]');
      if (typeLink) {
        const val = typeLink.textContent?.trim();
        if (val) mangaType = val;
      }
    }
  }

  // Sort chapters descending (highest number first) to ensure correct chronological order (e.g. Capítulo 38 down to Capítulo 1)
  const sortedTitles = [...titles].sort((a, b) => {
    const numA = parseFloat(a.match(/\d+(?:\.\d+)?/)?.[0] || '0');
    const numB = parseFloat(b.match(/\d+(?:\.\d+)?/)?.[0] || '0');
    return numB - numA;
  });

  return {
    title,
    coverUrl,
    synopsis,
    chapters: sortedTitles,
    chapterUrls: urls,
    mangaType,
  };
}

/**
 * Fetches all image URLs from a chapter page
 */
export async function fetchChapterImagesReal(chapterUrl: string): Promise<string[]> {
  if (chapterUrl.startsWith('mangadex://')) {
    try {
      const chapterId = chapterUrl.replace('mangadex://', '');
      const response = await fetch(`https://api.mangadex.org/at-home/server/${chapterId}`);
      if (!response.ok) {
        throw new Error(`Erro ao buscar imagens no servidor MangaDex (status ${response.status})`);
      }
      const data = await response.json();
      const baseUrl = data.baseUrl;
      const hash = data.chapter.hash;
      // Use dataSaver array if available, otherwise fallback to high quality 'data'
      const pageFilenames = data.chapter.dataSaver || data.chapter.data;
      const pathType = data.chapter.dataSaver ? 'data-saver' : 'data';

      return pageFilenames.map((filename: string) => `${baseUrl}/${pathType}/${hash}/${filename}`);
    } catch (err: any) {
      console.warn('[DEBUG] MangaDex fetchChapterImagesReal error:', err.message);
      throw err;
    }
  }

  const normalizedUrl = normalizeMangaUrl(chapterUrl);
  const html = await fetchHtml(normalizedUrl);
  const root = parse(html);
  const images: string[] = [];

  const isAsura = chapterUrl.includes('asura');

  // If it's Asura Scans, extract images from Astro props
  if (isAsura) {
    const matches = html.matchAll(/props="([^"]+)"/g);
    
    // Recursive helper to unwrap Astro serialized props
    const unwrapAstroProp = (val: any): any => {
      if (Array.isArray(val)) {
        if (val.length === 2 && val[0] === 0) {
          return unwrapAstroProp(val[1]);
        }
        if (val.length === 2 && val[0] === 1) {
          return val[1].map(unwrapAstroProp);
        }
        return val.map(unwrapAstroProp);
      }
      if (typeof val === 'object' && val !== null) {
        const res: any = {};
        for (const k in val) {
          res[k] = unwrapAstroProp(val[k]);
        }
        return res;
      }
      return val;
    };

    for (const match of matches) {
      try {
        const decoded = match[1].replace(/&quot;/g, '"');
        const parsed = JSON.parse(decoded);
        const unwrapped = unwrapAstroProp(parsed);
        const pagesList = unwrapped.pages || [];
        if (Array.isArray(pagesList) && pagesList.length > 0) {
          pagesList.forEach((pageItem: any) => {
            const imgUrl = pageItem?.url || pageItem?.imageUrl || pageItem?.image;
            if (imgUrl) {
              const cleanSrc = normalizeUrl(imgUrl, normalizedUrl);
              const highResSrc = getHighResImageUrl(cleanSrc);
              if (!images.includes(highResSrc)) {
                images.push(highResSrc);
              }
            }
          });
        }
      } catch (err) {
        // ignore
      }
    }
  }

  // Fallback / standard selectors (for other sources)
  if (images.length === 0) {
    const selectors = [
      '.reading-content img',
      '.wp-manga-chapter-img',
      '#readerarea img',
      '.page-break img',
      '.vung-doc img',
      '.container-chapter-reader img',
      '.chapter-container img'
    ];

    let rawImages: any[] = [];
    for (const selector of selectors) {
      const found = root.querySelectorAll(selector);
      if (found.length > 0) {
        rawImages = found;
        break;
      }
    }

    // Fallback: grab all images that look like manga pages
    if (rawImages.length === 0) {
      const allImgs = root.querySelectorAll('img');
      rawImages = allImgs.filter(img => {
        const src = img.getAttribute('data-src') || img.getAttribute('src') || '';
        return src.includes('/uploads/') || src.includes('/data/') || src.includes('/manga/') || src.includes('/comics/');
      });
    }

    rawImages.forEach((img) => {
      // Check various sources used for lazy loading
      const src = 
        img.getAttribute('data-src') || 
        img.getAttribute('data-lazy-src') || 
        img.getAttribute('data-src-webp') || 
        img.getAttribute('src') || 
        img.getAttribute('data-cfsrc');

      if (src) {
        const cleanSrc = normalizeUrl(src, normalizedUrl);
        // Filter out typical UI icons, banner ads or empty placeholders
        const isAdOrIcon = 
          cleanSrc.includes('/logo') || 
          cleanSrc.includes('/banner') || 
          cleanSrc.includes('/icon') || 
          cleanSrc.includes('/button') || 
          cleanSrc.includes('placeholder') ||
          cleanSrc.endsWith('.gif');
        
        if (!isAdOrIcon) {
          const highResSrc = getHighResImageUrl(cleanSrc);
          if (!images.includes(highResSrc)) {
            images.push(highResSrc);
          }
        }
      }
    });
  }

  if (images.length === 0) {
    throw new Error('Não foi possível encontrar as páginas de imagem no capítulo. O site pode estar protegido por Cloudflare ou alterou sua estrutura.');
  }

  return images;
}

export interface SearchResult {
  title: string;
  url: string;
  coverUrl: string;
  rating?: string;
  chapters?: Array<{
    name: string;
    date: string;
    url?: string;
  }>;
  alternativeUrl?: string;
  source?: string;
}

/**
 * Searches manga on AsuraScan using their API
 */
async function searchMangaAsura(query: string): Promise<SearchResult[]> {
  const origin = 'https://asurascans.com';

  // Asura exposes a search page at /browse?search=<query>
  const searchUrl = `${origin}/browse?search=${encodeURIComponent(query)}`;

  try {
    const html = await fetchHtml(searchUrl);
    const results: SearchResult[] = [];
    const titlesSeen = new Set<string>();

    // Try to extract series list from Astro island props first
    const unwrapAstroProp = (val: any): any => {
      if (Array.isArray(val)) {
        if (val.length === 2 && val[0] === 0) return unwrapAstroProp(val[1]);
        if (val.length === 2 && val[0] === 1) return val[1].map(unwrapAstroProp);
        return val.map(unwrapAstroProp);
      }
      if (typeof val === 'object' && val !== null) {
        const res: any = {};
        for (const k in val) res[k] = unwrapAstroProp(val[k]);
        return res;
      }
      return val;
    };

    const matches = [...html.matchAll(/props="([^"]+)"/g)];
    for (const match of matches) {
      try {
        const decoded = match[1].replace(/&quot;/g, '"');
        const parsed = JSON.parse(decoded);
        const unwrapped = unwrapAstroProp(parsed);

        const seriesList = unwrapped.initialSeries || unwrapped.series || [];
        if (Array.isArray(seriesList) && seriesList.length > 0) {
          seriesList.forEach((item: any) => {
            if (!item || !item.title) return;
            let title = item.title.trim()
              .replace(/&#39;/g, "'")
              .replace(/&amp;/g, '&')
              .replace(/&quot;/g, '"')
              .replace(/&lt;/g, '<')
              .replace(/&gt;/g, '>');

            if (titlesSeen.has(title)) return;
            titlesSeen.add(title);

            const slug = item.slug || '';
            const urlPath = item.public_url || `/comics/${slug}-fc4c7eba`;
            const finalUrl = urlPath.startsWith('http') ? urlPath : `${origin}${urlPath}`;
            const img = item.cover || item.cover_url || item.coverUrl || '';

            const chapters: Array<{ name: string; date: string }> = [];
            if (Array.isArray(item.latest_chapters)) {
              item.latest_chapters.slice(0, 2).forEach((ch: any) => {
                if (ch && ch.number !== undefined) {
                  chapters.push({ name: `Capítulo ${ch.number}`, date: '' });
                }
              });
            }

            results.push({
              title: title.replace(/\s+/g, ' '),
              url: finalUrl,
              coverUrl: img,
              chapters: chapters.length > 0 ? chapters : undefined,
            });
          });
          break; // found a valid block, stop
        }
      } catch (e) {
        // ignore parse errors
      }
    }

    // Fallback: HTML selector for comic links
    if (results.length === 0) {
      const root = parse(html);
      const links = root.querySelectorAll('a[href*="/comics/"]');
      links.forEach((el) => {
        const href = el.getAttribute('href');
        const titleEl = el.querySelector('span, h3, p');
        const title = titleEl?.textContent?.trim() || el.textContent?.trim() || '';
        const imgEl = el.querySelector('img');
        const imgUrl = imgEl?.getAttribute('data-src') || imgEl?.getAttribute('src') || '';
        if (!href || !title || titlesSeen.has(title)) return;
        titlesSeen.add(title);
        const finalUrl = href.startsWith('http') ? href : `${origin}${href}`;
        results.push({
          title: title.replace(/\s+/g, ' '),
          url: finalUrl,
          coverUrl: imgUrl,
        });
      });
    }

    return results;
  } catch (e) {
    console.warn('Asura search error:', e);
    return [];
  }
}

/**
 * Searches a manga on MangaDex and returns SearchResult array
 */
async function searchMangaDexGlobal(query: string): Promise<SearchResult[]> {
  try {
    const queryUrl = `https://api.mangadex.org/manga?title=${encodeURIComponent(query)}&limit=20&includes[]=cover_art`;
    console.log('[DEBUG] searchMangaDexGlobal: Fetching URL:', queryUrl);
    const response = await fetch(queryUrl, {
      headers: {
        'Accept': 'application/json',
      }
    });
    console.log('[DEBUG] searchMangaDexGlobal: Status code:', response.status);
    if (!response.ok) {
      const errText = await response.text();
      console.warn('[DEBUG] searchMangaDexGlobal: Error response body:', errText);
      return [];
    }
    const json = await response.json();
    const dataList = json.data || [];
    console.log(`[DEBUG] searchMangaDexGlobal: Returned ${dataList.length} items.`);
    const results: SearchResult[] = [];

    dataList.forEach((manga: any) => {
      const mangaId = manga.id;
      const title = manga.attributes.title.en || Object.values(manga.attributes.title)[0] || 'MangaDex Title';
      
      const coverArtRel = manga.relationships?.find((r: any) => r.type === 'cover_art');
      const fileName = coverArtRel?.attributes?.fileName;
      let coverUrl = '';
      if (fileName) {
        coverUrl = `https://uploads.mangadex.org/covers/${mangaId}/${fileName}`;
      }

      results.push({
        title,
        url: `https://mangadex.org/title/${mangaId}`,
        coverUrl,
        source: 'mangadex.org',
      });
    });

    return results;
  } catch (e: any) {
    console.error('[DEBUG] searchMangaDexGlobal error stack:', e.stack || e.message || e);
    return [];
  }
}

/**
 * Searches manga on the active source
 */
export async function searchMangaReal(query: string, source: string): Promise<SearchResult[]> {
  if (source === 'mangadex.org') {
    return searchMangaDexGlobal(query);
  }

  // Dispatch to source-specific search
  if (source.includes('asura')) {
    return searchMangaAsura(query);
  }



  if (source === 'novelbuddy.com') {
    return searchMangaNovelbuddy(query);
  }

  // --- MangaRead.org search ---
  const origin = `https://www.mangaread.org`;
  const searchUrl = `${origin}/?s=${encodeURIComponent(query)}&post_type=wp-manga`;

  const html = await fetchHtml(searchUrl);
  const root = parse(html);
  const results: SearchResult[] = [];

  // Madara theme search result container selector
  const items = root.querySelectorAll('.c-tabs-item__content');
  items.forEach((item) => {
    const titleEl = item.querySelector('.post-title a');
    const title = titleEl?.textContent?.trim();
    const href = titleEl?.getAttribute('href');

    const imgEl = item.querySelector('.tab-thumb img');
    const imgUrl = imgEl?.getAttribute('data-src') || imgEl?.getAttribute('data-lazy-src') || imgEl?.getAttribute('src');

    if (title && href) {
      let cover = imgUrl || '';
      if (cover.startsWith('//')) {
        cover = `https:${cover}`;
      } else if (cover.startsWith('/')) {
        cover = `${origin}${cover}`;
      }

      // Scrape rating
      const ratingEl = item.querySelector('.post-total-rating .score, .average-rating, .post-total-rating, .rating-stars, .average');
      let rating = ratingEl?.textContent?.trim() || '';
      const ratingMatch = rating.match(/\d+(\.\d+)?/);
      rating = ratingMatch ? ratingMatch[0] : '';

      // Scrape chapters
      const chapterItems = item.querySelectorAll('.list-chapter .chapter-item, .list-chapter .chapter, .chapter-item, .latest-chap');
      const chapters: Array<{ name: string; date: string; url?: string }> = [];
      chapterItems.forEach((chEl) => {
        const chLink = chEl.querySelector('a');
        const chName = chLink?.textContent?.trim() || '';
        const chUrl = chLink?.getAttribute('href') || '';
        const chDateEl = chEl.querySelector('.post-on, .date, span:last-child');
        const chDate = chDateEl?.textContent?.trim() || '';
        if (chName) {
          chapters.push({
            name: chName.replace(/\s+/g, ' '),
            date: chDate.replace(/\s+/g, ' '),
            url: chUrl,
          });
        }
      });

      results.push({
        title: title.replace(/\s+/g, ' '),
        url: href,
        coverUrl: getHighResImageUrl(cover || 'https://images.unsplash.com/photo-1541701494587-cb58502866ab?w=400&q=80'),
        rating: rating || undefined,
        chapters: chapters.length > 0 ? chapters.slice(0, 2) : undefined,
      });
    }
  });

  // Fallback selectors
  if (results.length === 0) {
    const backupItems = root.querySelectorAll('.manga-item, .post-item, .search-entry');
    backupItems.forEach((item) => {
      const titleEl = item.querySelector('.post-title a, .manga-title a, h3 a, h2 a');
      const title = titleEl?.textContent?.trim();
      const href = titleEl?.getAttribute('href');
      const imgEl = item.querySelector('img');
      const imgUrl = imgEl?.getAttribute('data-src') || imgEl?.getAttribute('src');

      if (title && href) {
        let cover = imgUrl || '';
        if (cover.startsWith('//')) {
          cover = `https:${cover}`;
        } else if (cover.startsWith('/')) {
          cover = `${origin}${cover}`;
        }

        // Scrape rating (fallback)
        const ratingEl = item.querySelector('.post-total-rating .score, .average-rating, .post-total-rating, .rating-stars, .average');
        let rating = ratingEl?.textContent?.trim() || '';
        const ratingMatch = rating.match(/\d+(\.\d+)?/);
        rating = ratingMatch ? ratingMatch[0] : '';

        // Scrape chapters (fallback)
        const chapterItems = item.querySelectorAll('.list-chapter .chapter-item, .list-chapter .chapter, .chapter-item, .latest-chap');
        const chapters: Array<{ name: string; date: string; url?: string }> = [];
        chapterItems.forEach((chEl) => {
          const chLink = chEl.querySelector('a');
          const chName = chLink?.textContent?.trim() || '';
          const chUrl = chLink?.getAttribute('href') || '';
          const chDateEl = chEl.querySelector('.post-on, .date, span:last-child');
          const chDate = chDateEl?.textContent?.trim() || '';
          if (chName) {
            chapters.push({
              name: chName.replace(/\s+/g, ' '),
              date: chDate.replace(/\s+/g, ' '),
              url: chUrl,
            });
          }
        });

        results.push({
          title: title.replace(/\s+/g, ' '),
          url: href,
          coverUrl: getHighResImageUrl(cover || 'https://images.unsplash.com/photo-1541701494587-cb58502866ab?w=400&q=80'),
          rating: rating || undefined,
          chapters: chapters.length > 0 ? chapters.slice(0, 2) : undefined,
        });
      }
    });
  }

  return results;
}

/**
 * Fetches latest updates from the source homepage
 */
export async function fetchLatestUpdatesReal(source: string, page: number = 1): Promise<SearchResult[]> {
  if (source === 'mangadex.org') {
    try {
      const queryUrl = `https://api.mangadex.org/manga?limit=30&offset=${(page - 1) * 30}&order[latestUploadedChapter]=desc&includes[]=cover_art`;
      console.log('[DEBUG] fetchLatestUpdatesReal (MangaDex): Fetching URL:', queryUrl);
      const response = await fetch(queryUrl, {
        headers: {
          'Accept': 'application/json',
        }
      });
      console.log('[DEBUG] fetchLatestUpdatesReal (MangaDex): Status code:', response.status);
      if (!response.ok) {
        const errText = await response.text();
        console.warn('[DEBUG] fetchLatestUpdatesReal (MangaDex): Error response body:', errText);
        return [];
      }
      const json = await response.json();
      const dataList = json.data || [];
      console.log(`[DEBUG] fetchLatestUpdatesReal (MangaDex): Returned ${dataList.length} items.`);
      const results: SearchResult[] = [];

      dataList.forEach((manga: any) => {
        const mangaId = manga.id;
        const title = manga.attributes.title.en || Object.values(manga.attributes.title)[0] || 'MangaDex Title';
        
        const coverArtRel = manga.relationships?.find((r: any) => r.type === 'cover_art');
        const fileName = coverArtRel?.attributes?.fileName;
        let coverUrl = 'https://images.unsplash.com/photo-1541701494587-cb58502866ab?w=400&q=80';
        if (fileName) {
          coverUrl = `https://uploads.mangadex.org/covers/${mangaId}/${fileName}`;
        }

        results.push({
          title,
          url: `https://mangadex.org/title/${mangaId}`,
          coverUrl,
          source: 'mangadex.org',
        });
      });

      return results;
    } catch (e: any) {
      console.error('[DEBUG] fetchLatestUpdatesReal (MangaDex) error stack:', e.stack || e.message || e);
      return [];
    }
  }

  if (source === 'novelbuddy.com') {
    try {
      const origin = 'https://novelbuddy.com';
      // Page 1 → /home (has latest section in __NEXT_DATA__)
      // Page N → /latest?page=N (paginated listing)
      const pageUrl = page === 1
        ? `${origin}/home`
        : `${origin}/latest?page=${page}`;

      const html = await fetchHtml(pageUrl);

      // Extract __NEXT_DATA__ JSON embedded by Next.js SSR
      const nextDataMatch = html.match(/<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
      if (!nextDataMatch) {
        console.warn('[DEBUG] NovelBuddy: __NEXT_DATA__ not found in HTML');
        return [];
      }

      let nextData: any;
      try {
        nextData = JSON.parse(nextDataMatch[1]);
      } catch (e) {
        console.warn('[DEBUG] NovelBuddy: failed to parse __NEXT_DATA__ JSON');
        return [];
      }

      // Page 1: data is at props.pageProps.latest.items
      // Page N: data may be at props.pageProps.items or props.pageProps.latest.items
      const pageProps = nextData?.props?.pageProps || {};
      const items: any[] =
        pageProps?.latest?.items ||
        pageProps?.items ||
        [];

      if (!Array.isArray(items) || items.length === 0) {
        console.log('[DEBUG] NovelBuddy: no items found in __NEXT_DATA__ for page', page);
        return [];
      }

      return items.map((item: any) => {
        const novelUrl = item.url
          ? (item.url.startsWith('http') ? item.url : `${origin}${item.url}`)
          : `${origin}/${item.slug || item.id}`;

        const coverUrl = item.cover || item.cover_url || item.coverUrl
          || 'https://images.unsplash.com/photo-1541701494587-cb58502866ab?w=400&q=80';

        const chapters: Array<{ name: string; date: string; url?: string }> = [];
        const latestChapters = item.latestChapters || item.latest_chapters || [];
        if (Array.isArray(latestChapters)) {
          latestChapters.slice(0, 2).forEach((ch: any) => {
            const chName = ch.name || (ch.number !== undefined ? `Chapter ${ch.number}` : '');
            const chDate = ch.date ? new Date(ch.date).toLocaleDateString('pt-BR') : '';
            const chUrl = ch.url ? (ch.url.startsWith('http') ? ch.url : `${origin}${ch.url}`) : undefined;
            if (chName) chapters.push({ name: chName, date: chDate, url: chUrl });
          });
        }

        return {
          title: (item.name || item.title || '').replace(/\s+/g, ' '),
          url: novelUrl,
          coverUrl,
          rating: item.rating ? String(item.rating) : undefined,
          chapters: chapters.length > 0 ? chapters : undefined,
          source: 'novelbuddy.com',
        } as SearchResult;
      });
    } catch (e: any) {
      console.warn('[DEBUG] NovelBuddy fetch error:', e.message);
      return [];
    }
  }

  // --- Asura Scans (HTML Scraper) ---
  if (source.includes('asura')) {
    try {
      const origin = `https://asurascans.com`;
      const url = page === 1 ? origin : `${origin}/browse?page=${page}`;
      console.log(`[DEBUG] fetchLatestUpdatesReal (asura) requesting URL: ${url}`);
      const html = await fetchHtml(url);
      console.log(`[DEBUG] fetchLatestUpdatesReal (asura) response HTML length: ${html.length}`);
      const results: SearchResult[] = [];

      // Extract JSON from astro-island components containing chapters or items
      const matches = [...html.matchAll(/props="([^"]+)"/g)];
      console.log(`[DEBUG] fetchLatestUpdatesReal (asura) found props=" matches: ${matches.length}`);
      const titlesSeen = new Set<string>();
      const urlsSeen = new Set<string>();

      // Recursive helper to unwrap Astro serialized props
      const unwrapAstroProp = (val: any): any => {
        if (Array.isArray(val)) {
          if (val.length === 2 && val[0] === 0) {
            return unwrapAstroProp(val[1]);
          }
          if (val.length === 2 && val[0] === 1) {
            return val[1].map(unwrapAstroProp);
          }
          return val.map(unwrapAstroProp);
        }
        if (typeof val === 'object' && val !== null) {
          const res: any = {};
          for (const k in val) {
            res[k] = unwrapAstroProp(val[k]);
          }
          return res;
        }
        return val;
      };

      let parsedMatchCount = 0;
      for (const match of matches) {
        try {
          const decoded = match[1].replace(/&quot;/g, '"');
          const parsed = JSON.parse(decoded);
          const unwrapped = unwrapAstroProp(parsed);
          
          const chaptersList = unwrapped.chapters || [];
          const seriesList = unwrapped.initialSeries || [];
          
          if (Array.isArray(chaptersList) && chaptersList.length > 0) {
            console.log(`[DEBUG] Found component with chaptersList of length: ${chaptersList.length}`);
            // Group chapters by comic name to match "Latest Updates" list
            const groupedComics: Record<string, { title: string, finalUrl: string, img: string, chapters: any[] }> = {};

            chaptersList.forEach((ch: any) => {
              if (ch && ch.comic_name) {
                // Decode HTML entities (e.g. &#39; -> ', &amp; -> &) in the manga title
                let title = ch.comic_name.trim();
                title = title
                  .replace(/&#39;/g, "'")
                  .replace(/&amp;/g, "&")
                  .replace(/&quot;/g, '"')
                  .replace(/&lt;/g, '<')
                  .replace(/&gt;/g, '>');

                const slug = ch.comic_slug || '';
                const urlPath = ch.comic_public_url || `/comics/${slug}-fc4c7eba`;
                const finalUrl = urlPath.startsWith('http') ? urlPath : `${origin}${urlPath}`;
                
                // Ensure image uses the correct cover url fallback if it is a different attribute name
                const img = ch.comic_cover || ch.cover_url || ch.coverUrl || 'https://images.unsplash.com/photo-1541701494587-cb58502866ab?w=400&q=80';

                if (!groupedComics[title]) {
                  groupedComics[title] = {
                    title,
                    finalUrl,
                    img,
                    chapters: []
                  };
                }

                if (ch.name) {
                  groupedComics[title].chapters.push({
                    name: `Capítulo ${ch.name}`,
                    date: ch.time_ago || ''
                  });
                }
              }
            });

            Object.values(groupedComics).forEach((item) => {
              if (titlesSeen.has(item.title) || urlsSeen.has(item.finalUrl)) return;
              titlesSeen.add(item.title);
              urlsSeen.add(item.finalUrl);

              results.push({
                title: item.title.replace(/\s+/g, ' '),
                url: item.finalUrl,
                coverUrl: item.img,
                chapters: item.chapters.slice(0, 2),
              });
            });
            parsedMatchCount++;
          } else if (Array.isArray(seriesList) && seriesList.length > 0) {
            console.log(`[DEBUG] Found component with seriesList of length: ${seriesList.length}`);
            // Paginated series list from /browse page
            seriesList.forEach((item: any) => {
              if (item && item.title) {
                let title = item.title.trim();
                title = title
                  .replace(/&#39;/g, "'")
                  .replace(/&amp;/g, "&")
                  .replace(/&quot;/g, '"')
                  .replace(/&lt;/g, '<')
                  .replace(/&gt;/g, '>');

                const slug = item.slug || '';
                const urlPath = item.public_url || `/comics/${slug}-fc4c7eba`;
                const finalUrl = urlPath.startsWith('http') ? urlPath : `${origin}${urlPath}`;
                const img = item.cover || item.cover_url || item.coverUrl || 'https://images.unsplash.com/photo-1541701494587-cb58502866ab?w=400&q=80';

                if (titlesSeen.has(title) || urlsSeen.has(finalUrl)) return;
                titlesSeen.add(title);
                urlsSeen.add(finalUrl);

                const chapters: any[] = [];
                if (Array.isArray(item.latest_chapters)) {
                  item.latest_chapters.forEach((ch: any) => {
                    if (ch && ch.number !== undefined) {
                      let formattedDate = '';
                      if (ch.published_at) {
                        try {
                          formattedDate = new Date(ch.published_at).toLocaleDateString('pt-BR');
                        } catch (err) {
                          formattedDate = String(ch.published_at).split('T')[0];
                        }
                      }
                      chapters.push({
                        name: `Capítulo ${ch.number}`,
                        date: formattedDate
                      });
                    }
                  });
                }

                results.push({
                  title: title.replace(/\s+/g, ' '),
                  url: finalUrl,
                  coverUrl: img,
                  chapters: chapters.slice(0, 2),
                });
              }
            });
            parsedMatchCount++;
          }
        } catch (e: any) {
          console.warn(`[DEBUG] Error parsing match JSON: ${e.message}`);
        }
      }
      console.log(`[DEBUG] fetchLatestUpdatesReal (asura) finished parsing islands. parsedMatchCount: ${parsedMatchCount}, total items parsed: ${results.length}`);

      // If parser failed, fallback to basic HTML query selector
      if (results.length === 0) {
        console.log(`[DEBUG] fetchLatestUpdatesReal (asura) results was 0. Falling back to querySelector...`);
        const root = parse(html);
        const items = root.querySelectorAll('a[href*="/comics/"]');
        console.log(`[DEBUG] fetchLatestUpdatesReal (asura) fallback found links count: ${items.length}`);
        items.forEach((item) => {
          const href = item.getAttribute('href');
          if (!href) return;

          const finalUrl = href.startsWith('http') ? href : `${origin}${href}`;

          const imgEl = item.querySelector('img');
          if (!imgEl) return;

          const title = item.textContent?.trim() || 'Mangá';
          const imgUrl = imgEl.getAttribute('data-src') || imgEl.getAttribute('src') || '';

          if (titlesSeen.has(title) || urlsSeen.has(finalUrl)) return;
          titlesSeen.add(title);
          urlsSeen.add(finalUrl);

          results.push({
            title: title.replace(/\s+/g, ' '),
            url: finalUrl,
            coverUrl: imgUrl,
          });
        });
        console.log(`[DEBUG] fetchLatestUpdatesReal (asura) fallback finished. total items: ${results.length}`);
      }

      return results;
    } catch (e) {
      console.warn('Asura Scans HTML Scraping error:', e);
      return [];
    }
  }

  // --- MangaRead.org (HTML scraper) ---
  const origin = `https://www.mangaread.org`;
  const url = page === 1 ? origin : `${origin}/page/${page}/`;
  const html = await fetchHtml(url);
  const root = parse(html);
  const results: SearchResult[] = [];

  const items = root.querySelectorAll('.page-item-detail.manga');
  items.forEach((item) => {
    const titleEl = item.querySelector('.post-title a, .post-title h3 a');
    const title = titleEl?.textContent?.trim();
    const href = titleEl?.getAttribute('href');

    const imgEl = item.querySelector('.item-thumb img, img');
    const imgUrl = imgEl?.getAttribute('data-src') || imgEl?.getAttribute('data-lazy-src') || imgEl?.getAttribute('src');

    if (title && href) {
      let cover = imgUrl || '';
      if (cover.startsWith('//')) {
        cover = `https:${cover}`;
      } else if (cover.startsWith('/')) {
        cover = `${origin}${cover}`;
      }

      // Scrape rating
      const ratingEl = item.querySelector('.post-total-rating .score, .average-rating, .post-total-rating, .rating-stars, .average');
      let rating = ratingEl?.textContent?.trim() || '';
      const ratingMatch = rating.match(/\d+(\.\d+)?/);
      rating = ratingMatch ? ratingMatch[0] : '';

      // Scrape chapters
      const chapterItems = item.querySelectorAll('.list-chapter .chapter-item, .list-chapter .chapter, .chapter-item, .latest-chap');
      const chapters: Array<{ name: string; date: string; url?: string }> = [];
      chapterItems.forEach((chEl) => {
        const chLink = chEl.querySelector('a');
        const chName = chLink?.textContent?.trim() || '';
        const chUrl = chLink?.getAttribute('href') || '';
        const chDateEl = chEl.querySelector('.post-on, .date, span:last-child');
        const chDate = chDateEl?.textContent?.trim() || '';
        if (chName) {
          chapters.push({
            name: chName.replace(/\s+/g, ' '),
            date: chDate.replace(/\s+/g, ' '),
            url: chUrl,
          });
        }
      });

      results.push({
        title: title.replace(/\s+/g, ' '),
        url: href,
        coverUrl: getHighResImageUrl(cover || 'https://images.unsplash.com/photo-1541701494587-cb58502866ab?w=400&q=80'),
        rating: rating || undefined,
        chapters: chapters.length > 0 ? chapters.slice(0, 2) : undefined,
      });
    }
  });

  return results;
}



/**
 * Helper search for novelbuddy.com
 */
async function searchMangaNovelbuddy(query: string): Promise<SearchResult[]> {
  const origin = 'https://novelbuddy.com';
  const url = `${origin}/search?q=${encodeURIComponent(query)}`;
  try {
    const html = await fetchHtml(url);
    console.log(`[DEBUG] NovelBuddy search html length: ${html.length}`);
    const root = parse(html);
    const results: SearchResult[] = [];
    const titlesSeen = new Set<string>();

    // 1. Try parsing Next.js dynamic payload in __NEXT_DATA__ script tag
    const nextDataEl = root.querySelector('script#__NEXT_DATA__, script[id="__NEXT_DATA__"]');
    if (nextDataEl) {
      try {
        const nextData = JSON.parse(nextDataEl.textContent || '{}');
        const ssrItems = nextData?.props?.pageProps?.ssrItems || [];
        console.log(`[DEBUG] Found __NEXT_DATA__, ssrItems count: ${ssrItems.length}`);
        
        ssrItems.forEach((item: any) => {
          const title = item.name?.trim() || '';
          const href = item.url || '';
          const imgUrl = item.cover || '';

          if (title && href && !titlesSeen.has(title)) {
            titlesSeen.add(title);
            results.push({
              title: title.replace(/\s+/g, ' '),
              url: href.startsWith('http') ? href : `${origin}${href}`,
              coverUrl: imgUrl || 'https://images.unsplash.com/photo-1541701494587-cb58502866ab?w=400&q=80',
              source: 'novelbuddy.com',
            });
          }
        });
      } catch (err) {
        console.warn('Error parsing __NEXT_DATA__ json:', err);
      }
    }

    // 2. Fallback to HTML parsing if __NEXT_DATA__ was not found or failed to return items
    if (results.length === 0) {
      console.log('[DEBUG] Falling back to HTML selectors parsing for NovelBuddy');
      const items = root.querySelectorAll('a[title], .book-item, .novel-item, .col-md-6, div.grid > div, .group');
      const navSlugs = new Set([
        '/', '/home', '/trending', '/filters', '/search', '/latest', 
        '/popular', '/hot-chapters', '/hall-of-fame', '/me/history', 
        '/feed', '/reviews', '/lists', '/discussions', '/login', '/register'
      ]);

      items.forEach((item) => {
        let titleEl = item;
        if (!item.getAttribute('title')) {
          titleEl = item.querySelector('a[title]') || item;
        }
        const title = titleEl.getAttribute('title')?.trim() || titleEl.textContent?.trim() || '';
        const href = titleEl.getAttribute('href') || '';
        if (!title || !href) return;

        // Skip menu / navigation links
        if (navSlugs.has(href) || href.startsWith('/me/') || href.includes('search') || href.includes('home')) {
          return;
        }

        const parent = item.parentNode;
        const imgEl = item.querySelector('img') || parent?.querySelector('img');
        const imgUrl = imgEl?.getAttribute('data-src') || imgEl?.getAttribute('src') || '';

        if (!titlesSeen.has(title)) {
          titlesSeen.add(title);
          results.push({
            title: title.replace(/\s+/g, ' '),
            url: href.startsWith('http') ? href : `${origin}${href}`,
            coverUrl: imgUrl || 'https://images.unsplash.com/photo-1541701494587-cb58502866ab?w=400&q=80',
            source: 'novelbuddy.com',
          });
        }
      });
    }

    if (results.length === 0) {
      const anchors = root.querySelectorAll('a[href*="/novel/"]');
      anchors.forEach(a => {
        const title = a.getAttribute('title')?.trim() || a.textContent?.trim() || '';
        const href = a.getAttribute('href') || '';
        if (title && title.length > 3 && href && !titlesSeen.has(title)) {
          titlesSeen.add(title);
          results.push({
            title: title.replace(/\s+/g, ' '),
            url: href.startsWith('http') ? href : `${origin}${href}`,
            coverUrl: 'https://images.unsplash.com/photo-1541701494587-cb58502866ab?w=400&q=80',
            source: 'novelbuddy.com',
          });
        }
      });
    }
    return results;
  } catch (e) {
    console.warn('Novelbuddy search error:', e);
    return [];
  }
}

/**
 * Helper to match titles robustly across different translations/sources
 */
function isTitleMatch(titleA: string, titleB: string): boolean {
  const normA = titleA.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean);
  const normB = titleB.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean);

  if (normA.length === 0 || normB.length === 0) return false;

  const fillers = new Set(['the', 'of', 'a', 'an', 'to', 'in', 'and', 'for', 'on', 'with', 'at', 'by']);
  const wordsA = normA.filter(w => !fillers.has(w));
  const wordsB = normB.filter(w => !fillers.has(w));

  const finalA = wordsA.length > 0 ? wordsA : normA;
  const finalB = wordsB.length > 0 ? wordsB : normB;

  const setA = new Set(finalA);
  const intersection = finalB.filter(w => setA.has(w));

  const minLength = Math.min(finalA.length, finalB.length);
  const matchRatio = intersection.length / minLength;

  return matchRatio >= 0.7;
}

/**
 * Fetches novel chapter text content as paragraphs from NovelBuddy
 */
export async function fetchNovelTextReal(chapterUrl: string): Promise<string[]> {
  const normalizedUrl = normalizeMangaUrl(chapterUrl);
  const html = await fetchHtml(normalizedUrl);
  const root = parse(html);
  const paragraphs: string[] = [];

  // Try extracting from Next.js __NEXT_DATA__ first
  const nextDataMatch = html.match(/<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (nextDataMatch) {
    try {
      const nextData = JSON.parse(nextDataMatch[1]);
      const chapter = nextData?.props?.pageProps?.chapter || {};
      const content = chapter.content || chapter.body || nextData?.props?.pageProps?.content || '';
      if (content && content.length > 50) {
        // If content contains HTML tags like <p>, parse them. Otherwise split by newlines.
        const cleanHtml = content.includes('<p>') ? content : content.split('\n').map((p: string) => `<p>${p}</p>`).join('');
        const contentRoot = parse(cleanHtml);
        const pElements = contentRoot.querySelectorAll('p');
        pElements.forEach((p) => {
          const text = p.textContent?.trim();
          if (text && text.length > 2) {
            paragraphs.push(text);
          }
        });
      }
    } catch (e) {
      console.warn('Error parsing chapter __NEXT_DATA__:', e);
    }
  }

  // Fallback to standard DOM selectors if __NEXT_DATA__ parsing didn't find paragraphs
  if (paragraphs.length === 0) {
    const selectors = ['#chapter-container p', '.chapter-content p', '.reading-content p', 'div.themed-scroll p', 'div.txt p'];

    let foundP: any[] = [];
    for (const selector of selectors) {
      const elements = root.querySelectorAll(selector);
      if (elements.length > 0) {
        foundP = elements;
        break;
      }
    }

    if (foundP.length === 0) {
      const container = root.querySelector('.chapter-content, #chapter-container, div.txt, .reading-content');
      if (container) {
        foundP = container.querySelectorAll('p');
      }
    }

    if (foundP.length === 0) {
      foundP = root.querySelectorAll('p');
    }

    foundP.forEach((p) => {
      const text = p.textContent?.trim();
      if (text && text.length > 2) {
        paragraphs.push(text);
      }
    });
  }

  if (paragraphs.length === 0) {
    throw new Error('Não foi possível extrair o texto do capítulo. O site pode estar protegido ou a estrutura mudou.');
  }

  return paragraphs;
}

/**
 * Fetches trending novels from NovelBuddy's home page.
 * The "Trending Manga" section is rendered in plain HTML markup (not in __NEXT_DATA__).
 * Each trending entry is an <a> link with an <img> cover and a <p> title, inside a grid.
 */
export async function fetchNovelBuddyTrending(): Promise<SearchResult[]> {
  try {
    const origin = 'https://novelbuddy.com';
    const html = await fetchHtml(`${origin}/home`);
    const root = parse(html);

    // The trending section contains <a> elements that each have:
    // - href="/slug"
    // - img src="https://static.novelbuddy.com/covers/slug.png"
    // - p with the title text
    // They are inside a grid that immediately follows the "Trending period" tablist.
    // We identify them by the cover CDN domain.
    const results: SearchResult[] = [];
    const seen = new Set<string>();

    // Find all <a> elements that link to novel pages and have a static.novelbuddy.com cover image
    const allLinks = root.querySelectorAll('a[href]');
    for (const link of allLinks) {
      const href = link.getAttribute('href') || '';
      // Skip non-novel links (must be a simple /slug path, no extra segments)
      if (!href.startsWith('/') || href.split('/').length !== 2 || href === '/') continue;

      const img = link.querySelector('img');
      if (!img) continue;

      const imgSrc = img.getAttribute('src') || '';
      if (!imgSrc.includes('static.novelbuddy.com/covers/')) continue;

      const slug = href.slice(1); // remove leading /
      if (seen.has(slug)) continue;

      const titleEl = link.querySelector('p');
      const title = (titleEl?.textContent || img.getAttribute('alt') || slug)
        .replace(/&#x27;/g, "'")
        .replace(/&amp;/g, '&')
        .replace(/\s+/g, ' ')
        .trim();

      if (!title) continue;
      seen.add(slug);

      results.push({
        title,
        url: `${origin}${href}`,
        coverUrl: imgSrc,
        source: 'novelbuddy.com',
      } as SearchResult);

      // The trending section only shows 10 items — stop once we have them
      if (results.length >= 10) break;
    }

    return results;
  } catch (e: any) {
    console.warn('[DEBUG] fetchNovelBuddyTrending error:', e.message);
    return [];
  }
}

/**
 * Searches for a novel on NovelFull and returns the relative path of the first match
 */
export async function searchNovelFull(title: string): Promise<string | null> {
  try {
    const origin = 'https://novelfull.com';
    const searchUrl = `${origin}/search?keyword=${encodeURIComponent(title)}`;
    const html = await fetchHtml(searchUrl);
    const root = parse(html);

    // The first result's anchor element
    const firstTitleLink = root.querySelector('.truyen-title a, .title a, .list-truyen .truyen-title a');
    if (firstTitleLink) {
      const href = firstTitleLink.getAttribute('href');
      if (href) {
        return href;
      }
    }
    return null;
  } catch (e: any) {
    console.warn('[DEBUG] searchNovelFull error:', e.message);
    return null;
  }
}

/**
 * Fetches novel info, paginated chapter names, and chapter URLs from NovelFull
 */
export async function fetchNovelFullDetails(novelUrl: string, page: number = 1): Promise<any> {
  try {
    const origin = 'https://novelfull.com';
    const targetUrl = novelUrl.startsWith('http') 
      ? `${novelUrl}${novelUrl.includes('?') ? '&' : '?'}page=${page}`
      : `${origin}${novelUrl}${novelUrl.includes('?') ? '&' : '?'}page=${page}`;

    const html = await fetchHtml(targetUrl);
    const root = parse(html);

    // Meta details
    const titleEl = root.querySelector('.books .desc .title, h3.title, .title-list .title');
    const title = titleEl?.textContent?.trim() || 'NovelFull Title';

    const imgEl = root.querySelector('.book img, .info-holder .book img');
    let coverUrl = imgEl?.getAttribute('src') || '';
    if (coverUrl && coverUrl.startsWith('/')) {
      coverUrl = `${origin}${coverUrl}`;
    }

    // Synopsis
    const descEl = root.querySelector('.desc-text, .desc-text p');
    const synopsis = descEl?.textContent?.trim() || '';

    // Chapters list (50 chapters per page)
    const chapterLinks = root.querySelectorAll('ul.list-chapter li a, .list-chapter li a');
    const chapters: string[] = [];
    const chapterUrls: Record<string, string> = {};

    chapterLinks.forEach((link) => {
      let chTitle = link.textContent?.trim() || '';
      chTitle = cleanChapterTitle(chTitle);
      
      let href = link.getAttribute('href') || '';
      if (href && !href.startsWith('http')) {
        href = `${origin}${href}`;
      }

      if (chTitle && href) {
        if (!chapters.includes(chTitle)) {
          chapters.push(chTitle);
          chapterUrls[chTitle] = href;
        }
      }
    });

    // Extract total pages of chapters
    let totalPages = 1;
    const lastPageEl = root.querySelector('.pagination li.last a');
    if (lastPageEl) {
      const dataPage = lastPageEl.getAttribute('data-page');
      if (dataPage) {
        totalPages = parseInt(dataPage, 10) + 1;
      } else {
        const href = lastPageEl.getAttribute('href') || '';
        const match = href.match(/[?&]page=(\d+)/);
        if (match) {
          totalPages = parseInt(match[1], 10);
        }
      }
    } else {
      const pageLinks = root.querySelectorAll('.pagination li a');
      pageLinks.forEach((pLink) => {
        const pageText = pLink.textContent?.trim();
        const pNum = parseInt(pageText || '', 10);
        if (!isNaN(pNum) && pNum > totalPages) {
          totalPages = pNum;
        }
      });
    }

    return {
      title,
      coverUrl,
      synopsis,
      chapters,
      chapterUrls,
      totalPages,
      source: 'novelfull.com',
      url: novelUrl.startsWith('http') ? novelUrl : `${origin}${novelUrl}`
    };
  } catch (e: any) {
    console.warn('[DEBUG] fetchNovelFullDetails error:', e.message);
    throw e;
  }
}

/**
 * Fetches ALL chapters for a given NovelFull novel URL by retrieving the novelId
 * from its detail page and querying the ajax-chapter-option endpoint.
 */
export async function fetchNovelFullAllChapters(novelUrl: string): Promise<{ chapters: string[], chapterUrls: Record<string, string> }> {
  try {
    const origin = 'https://novelfull.com';
    const targetUrl = novelUrl.startsWith('http') ? novelUrl : `${origin}${novelUrl}`;
    const html = await fetchHtml(targetUrl);
    const root = parse(html);

    // Extract novel ID
    const ratingEl = root.querySelector('#rating');
    const novelId = ratingEl?.getAttribute('data-novel-id');

    if (!novelId) {
      console.warn('[DEBUG] fetchNovelFullAllChapters: data-novel-id not found on page');
      return { chapters: [], chapterUrls: {} };
    }

    console.log(`[DEBUG] fetchNovelFullAllChapters: Found novelId = ${novelId}. Fetching all chapters via AJAX...`);

    // Fetch all chapters from the AJAX options endpoint
    let ajaxUrl = `${origin}/ajax-chapter-option`;
    let response = await fetch(ajaxUrl, {
      method: 'POST',
      headers: {
        ...DEFAULT_HEADERS,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': targetUrl,
      },
      body: `novelId=${novelId}`
    });

    if (!response.ok) {
      // Fallback: try GET
      response = await fetch(`${ajaxUrl}?novelId=${novelId}`, {
        method: 'GET',
        headers: {
          ...DEFAULT_HEADERS,
          'Referer': targetUrl,
        }
      });
    }

    if (!response.ok) {
      throw new Error(`AJAX request failed with status: ${response.status}`);
    }

    const ajaxHtml = await response.text();
    const ajaxRoot = parse(ajaxHtml);
    const optionElements = ajaxRoot.querySelectorAll('option');

    const chapters: string[] = [];
    const chapterUrls: Record<string, string> = {};

    optionElements.forEach((option) => {
      let chTitle = option.textContent?.trim() || '';
      chTitle = cleanChapterTitle(chTitle);
      
      let href = option.getAttribute('value') || '';
      if (href && !href.startsWith('http')) {
        href = `${origin}${href}`;
      }

      if (chTitle && href) {
        if (!chapters.includes(chTitle)) {
          chapters.push(chTitle);
          chapterUrls[chTitle] = href;
        }
      }
    });

    console.log(`[DEBUG] fetchNovelFullAllChapters: Successfully parsed ${chapters.length} chapters.`);
    return { chapters, chapterUrls };
  } catch (e: any) {
    console.warn('[DEBUG] fetchNovelFullAllChapters error:', e.message);
    return { chapters: [], chapterUrls: {} };
  }
}

/**
 * Searches a manga on MangaDex and returns its metadata
 */
export async function searchMangaDex(title: string): Promise<any> {
  try {
    const queryUrl = `https://api.mangadex.org/manga?title=${encodeURIComponent(title)}&limit=5&includes[]=cover_art`;
    const response = await fetch(queryUrl, { headers: { 'Accept': 'application/json' } });
    if (!response.ok) {
      throw new Error(`MangaDex search failed (status ${response.status})`);
    }
    const json = await response.json();
    const dataList = json.data || [];
    if (dataList.length === 0) return null;

    const manga = dataList[0];
    const mangaId = manga.id;
    const mangaTitle = manga.attributes.title.en || Object.values(manga.attributes.title)[0] || 'MangaDex Title';
    const synopsis = manga.attributes.description.en || Object.values(manga.attributes.description)[0] || '';

    // Find cover art file name from expanded relationships
    const coverArtRel = manga.relationships?.find((r: any) => r.type === 'cover_art');
    const fileName = coverArtRel?.attributes?.fileName;
    let coverUrl = 'https://images.unsplash.com/photo-1541701494587-cb58502866ab?w=400&q=80';
    if (fileName) {
      coverUrl = `https://uploads.mangadex.org/covers/${mangaId}/${fileName}`;
    }

    return {
      id: mangaId,
      title: mangaTitle,
      coverUrl,
      synopsis,
      source: 'mangadex.org',
    };
  } catch (e: any) {
    console.warn('[DEBUG] searchMangaDex error:', e.message);
    return null;
  }
}

/**
 * Fetches all chapters from MangaDex in Portuguese (pt-br) and English (en)
 */
export async function fetchMangaDexChapters(mangaId: string): Promise<{ chapters: string[], chapterUrls: Record<string, string> }> {
  try {
    const chapters: string[] = [];
    const chapterUrls: Record<string, string> = {};
    const seenChapters = new Set<string>();

    let offset = 0;
    let total = 1;

    console.log(`[DEBUG] fetchMangaDexChapters: Starting download loop for mangaId: ${mangaId}`);

    while (offset < total) {
      const feedUrl = `https://api.mangadex.org/manga/${mangaId}/feed?limit=500&offset=${offset}&translatedLanguage[]=pt-br&translatedLanguage[]=en&order[chapter]=asc`;
      const response = await fetch(feedUrl, { headers: { 'Accept': 'application/json' } });
      if (!response.ok) {
        throw new Error(`Feed fetch failed (status ${response.status})`);
      }
      const json = await response.json();
      total = json.total || 0;
      const items = json.data || [];
      if (items.length === 0) break;

      items.forEach((item: any) => {
        const chId = item.id;
        const chNum = item.attributes.chapter;
        if (!chNum) return; // skip items without a chapter number

        const chTitle = item.attributes.title || '';
        const lang = item.attributes.translatedLanguage === 'pt-br' ? 'PT-BR' : 'EN';
        
        // Ex: "Capítulo 10 - Fim do Mundo (PT-BR)"
        const name = `Capítulo ${chNum}${chTitle ? ' - ' + chTitle : ''} (${lang})`;
        const key = `${chNum}-${lang}`; // unique key to prevent duplicate releases for same chapter number and lang

        if (!seenChapters.has(key)) {
          seenChapters.add(key);
          chapters.push(name);
          chapterUrls[name] = `mangadex://${chId}`;
        }
      });

      offset += items.length;
    }

    // Return chronological order (descending order for details display, or sorted ascending in Context)
    // We sort chapters descending to follow standard display layout (highest chapter first)
    const sortedChapters = [...chapters].sort((a, b) => {
      const numA = parseFloat(a.match(/\d+(?:\.\d+)?/)?.[0] || '0');
      const numB = parseFloat(b.match(/\d+(?:\.\d+)?/)?.[0] || '0');
      if (numB !== numA) return numB - numA;
      // Secondary sort by PT-BR first
      return a.includes('PT-BR') ? -1 : 1;
    });

    console.log(`[DEBUG] fetchMangaDexChapters: Successfully parsed ${sortedChapters.length} chapters.`);
    return { chapters: sortedChapters, chapterUrls };
  } catch (e: any) {
    console.warn('[DEBUG] fetchMangaDexChapters error:', e.message);
    return { chapters: [], chapterUrls: {} };
  }
}



