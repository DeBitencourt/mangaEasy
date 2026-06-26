const { parse } = require('node-html-parser');

const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9,pt-BR;q=0.8,pt;q=0.7',
  'Cache-Control': 'no-cache',
};

async function test(url) {
  let targetUrl = url.trim();

  if (targetUrl.includes('mangaread.org') && !targetUrl.includes('www.mangaread.org')) {
    targetUrl = targetUrl.replace('mangaread.org', 'www.mangaread.org');
  }
  if ((targetUrl.includes('/manga/') || targetUrl.includes('/chapter/')) && !targetUrl.endsWith('/')) {
    targetUrl = targetUrl + '/';
  }

  console.log(`Fetching: ${targetUrl}`);
  try {
    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        ...DEFAULT_HEADERS,
        'Referer': targetUrl,
      },
    });

    console.log(`Response Status: ${response.status}`);
    console.log(`Response URL: ${response.url}`);
    
    const html = await response.text();
    const root = parse(html);
    
    // Title
    let title = '';
    const ogTitle = root.querySelector('meta[property="og:title"]')?.getAttribute('content');
    if (ogTitle) {
      title = ogTitle.split(' - ')[0].split(' | ')[0].trim();
    }
    if (!title) {
      title = root.querySelector('title')?.textContent?.trim();
    }
    console.log(`Title: "${title}"`);
    
    // Synopsis
    const ogDesc = root.querySelector('meta[property="og:description"]')?.getAttribute('content');
    console.log(`Og:description: "${ogDesc}"`);
    
    // Chapters
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
      console.log(`Selector "${selector}" matches: ${elements.length}`);
    }
    
    // Let's print some elements in the body
    console.log(`Body elements check:`);
    console.log(`H1 elements count: ${root.querySelectorAll('h1').length}`);
    root.querySelectorAll('h1').forEach(h1 => console.log(`  H1: ${h1.textContent?.trim()}`));
    
  } catch (err) {
    console.error('Error fetching/parsing:', err);
  }
}

test('https://mangaread.org/manga/solo-leveling');
