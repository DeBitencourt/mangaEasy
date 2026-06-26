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

  const response = await fetch(targetUrl, {
    method: 'GET',
    headers: {
      ...DEFAULT_HEADERS,
      'Referer': targetUrl,
    },
  });

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
        const text = el.textContent?.trim();
        if (href && text) {
          links.push({
            title: text.replace(/\s+/g, ' '),
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
      const text = el.textContent?.trim();
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
        
        const isMangaRoute = hrefLower.includes('/manga/');
        
        if (isChapterLink && (isMangaRoute || href.startsWith('http') || href.startsWith('/'))) {
          // Avoid duplicate main manga pages or lists
          if (!hrefLower.endsWith('/manga/') && !hrefLower.endsWith('/manga')) {
            links.push({
              title: text.replace(/\s+/g, ' '),
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
  const hasMangaElements = root.querySelector('.summary_image, .tab-summary, .manga-info-row, li.wp-manga-chapter, .post-title, .post-title h1');
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

  return {
    title,
    coverUrl,
    synopsis,
    chapters: titles,
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

  // Common selectors for chapter reader image containers
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
 * Searches manga on the active source
 */
export async function searchMangaReal(query: string, source: string): Promise<SearchResult[]> {
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
  // --- Asura Scans (REST API) ---
  if (source.includes('asura')) {
    try {
      const apiUrl = `https://api.asurascans.com/series?page=${page}&page_size=20&ordering=-last_chapter_at`;
      const response = await fetch(apiUrl, {
        headers: {
          'Accept': 'application/json',
          'Origin': 'https://asurascans.com',
          'Referer': 'https://asurascans.com/',
          'User-Agent': DEFAULT_HEADERS['User-Agent'],
        },
      });
      if (!response.ok) throw new Error(`Asura API error: ${response.status}`);
      const json = await response.json();
      const items: any[] = json.results || json.data || json || [];
      return items.map((item: any) => ({
        title: item.title || '',
        url: `https://asurascans.com${item.public_url || item.source_url || `/comics/${item.slug}`}`,
        coverUrl: item.cover_url || item.coverUrl || 'https://images.unsplash.com/photo-1541701494587-cb58502866ab?w=400&q=80',
        rating: item.rating !== undefined ? String(item.rating) : undefined,
        chapters: item.last_chapter_at
          ? [{ name: `Cap. ${item.chapter_count || '?'}`, date: new Date(item.last_chapter_at).toLocaleDateString('pt-BR') }]
          : undefined,
      }));
    } catch (e) {
      console.error('Asura API error:', e);
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
