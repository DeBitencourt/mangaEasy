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
  const normalizedUrl = normalizeMangaUrl(url);
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
}

/**
 * Searches manga on AsuraScan using their API
 */
async function searchMangaAsura(query: string): Promise<SearchResult[]> {
  const origin = 'https://asurascans.com';

  // Asura exposes a search page at /series?name=<query>
  const searchUrl = `${origin}/series?name=${encodeURIComponent(query)}`;

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
 * Searches manga on the active source
 */
export async function searchMangaReal(query: string, source: string): Promise<SearchResult[]> {
  // Dispatch to source-specific search
  if (source.includes('asura')) {
    return searchMangaAsura(query);
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
