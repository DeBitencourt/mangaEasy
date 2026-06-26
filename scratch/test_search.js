const { parse } = require('node-html-parser');

const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9,pt-BR;q=0.8,pt;q=0.7',
  'Cache-Control': 'no-cache',
};

async function testSearch(query) {
  const url = `https://www.mangaread.org/?s=${encodeURIComponent(query)}&post_type=wp-manga`;
  console.log(`Searching: ${url}`);
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        ...DEFAULT_HEADERS,
        'Referer': url,
      },
    });

    console.log(`Response Status: ${response.status}`);
    const html = await response.text();
    const root = parse(html);
    
    // Let's inspect some elements to find the search results containers
    // Commonly .c-tabs-item__content or .search-wrap
    const items = root.querySelectorAll('.c-tabs-item__content');
    console.log(`Found .c-tabs-item__content count: ${items.length}`);
    
    const results = [];
    
    items.forEach((item, index) => {
      const titleEl = item.querySelector('.post-title a');
      const title = titleEl?.textContent?.trim();
      const href = titleEl?.getAttribute('href');
      
      const imgEl = item.querySelector('.tab-thumb img');
      const imgUrl = imgEl?.getAttribute('data-src') || imgEl?.getAttribute('src');
      
      console.log(`Item #${index + 1}:`);
      console.log(`  Title: "${title}"`);
      console.log(`  URL: "${href}"`);
      console.log(`  Image: "${imgUrl}"`);
      
      if (title && href) {
        results.push({ title, href, imgUrl });
      }
    });

    // If nothing found with .c-tabs-item__content, let's look for other selectors
    if (results.length === 0) {
      console.log('No items found with .c-tabs-item__content. Trying fallback search selectors...');
      
      // Let's print all <a> tags inside h3 or h4 or .post-title
      const postTitles = root.querySelectorAll('.post-title, .manga-title, h3, h4');
      console.log(`Found post-titles/headers count: ${postTitles.length}`);
      postTitles.forEach((pt, index) => {
        const link = pt.querySelector('a');
        if (link) {
          console.log(`  Link #${index + 1}: text="${link.textContent?.trim()}" href="${link.getAttribute('href')}"`);
        }
      });
    }

  } catch (err) {
    console.error('Error fetching/parsing:', err);
  }
}

testSearch('solo leveling');
