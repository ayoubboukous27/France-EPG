const dayjs = require('dayjs')
const utc = require('dayjs/plugin/utc')
const puppeteer = require('puppeteer')
const axios = require('axios')

dayjs.extend(utc)

/**
 * Axios instance with browser-like headers (كخيار احتياطي)
 */
const http = axios.create({
  timeout: 30000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
    'Referer': 'https://www.canalplus.com/',
    'Origin': 'https://www.canalplus.com',
  }
})

module.exports = {
  site: 'canalplus.com',
  days: 2,

  /**
   * استخدام Puppeteer للحصول على التوكين والبيانات
   */
  url: async function ({ channel, date }) {
    try {
      const [region, site_id] = channel.site_id.split('#')
      
      // محاولة الحصول على التوكين باستخدام Puppeteer
      const token = await getTokenWithPuppeteer(region)
      
      if (!token) {
        console.error('❌ فشل الحصول على التوكين حتى مع Puppeteer')
        return null
      }

      const path = region === 'pl' ? 'mycanalint' : 'mycanal'
      const diff = date.diff(dayjs.utc().startOf('d'), 'd')

      return `https://hodor.canalplus.pro/api/v2/${path}/channels/${token}/${site_id}/broadcasts/day/${diff}`
    } catch (error) {
      console.error('❌ خطأ في بناء URL:', error.message)
      return null
    }
  },

  /**
   * استخدام Puppeteer لجلب البيانات إذا فشل axios
   */
  async parser({ content, channel, date }) {
    let programs = []
    
    // محاولة تحليل JSON العادي أولاً
    let items = parseItems(content)
    
    // إذا لم نجد برامج، استخدم Puppeteer
    if (items.length === 0) {
      console.log('⚠️ لم نجد برامج في JSON، نجرب Puppeteer...')
      items = await getProgramsWithPuppeteer(channel, date)
    }

    for (let item of items) {
      try {
        const prev = programs[programs.length - 1]
        const details = await loadProgramDetails(item)
        const info = parseInfo(details)
        const start = parseStart(item)

        if (!start) continue
        if (prev) prev.stop = start

        programs.push({
          title: item.title || item.programTitle || '',
          description: parseDescription(info),
          image: parseImage(info),
          actors: parseCast(info, 'Avec :'),
          director: parseCast(info, 'De :'),
          writer: parseCast(info, 'Scénario :'),
          composer: parseCast(info, 'Musique :'),
          presenter: parseCast(info, 'Présenté par :'),
          date: parseDate(info),
          rating: parseRating(info),
          start,
          stop: start.add(1, 'hour')
        })
      } catch (error) {
        console.error('❌ خطأ في معالجة برنامج:', error.message)
        continue
      }
    }

    return programs
  }
}

/* ===================== HELPERS المتطورة ===================== */

async function getTokenWithPuppeteer(region) {
  let browser = null
  try {
    console.log('🚀 تشغيل Puppeteer للحصول على التوكين...')
    
    // تشغيل المتصفح
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
        '--window-size=1920,1080'
      ]
    })
    
    const page = await browser.newPage()
    
    // تعيين وكيل المستخدم
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36')
    
    // تعيين الـ Viewport
    await page.setViewport({ width: 1920, height: 1080 })
    
    // تعيين الـ Headers الإضافية
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8'
    })
    
    // الذهاب إلى الصفحة
    const url = region === 'pl' 
      ? 'https://www.canalplus.com/pl/program-tv/' 
      : 'https://www.canalplus.com/programme-tv/'
    
    console.log(`🌐 تحميل الصفحة: ${url}`)
    
    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 30000
    })
    
    // انتظار قليلاً لتحميل JavaScript
    await page.waitForTimeout(3000)
    
    // محاولة العثور على التوكين بعدة طرق
    
    // الطريقة 1: من متغيرات window
    const token1 = await page.evaluate(() => {
      try {
        // البحث في window.__INITIAL_STATE__
        if (window.__INITIAL_STATE__ && window.__INITIAL_STATE__.token) {
          return window.__INITIAL_STATE__.token
        }
        
        // البحث في localStorage
        const token = localStorage.getItem('token') || 
                     localStorage.getItem('accessToken') ||
                     sessionStorage.getItem('token')
        if (token) return token
        
        return null
      } catch (e) {
        return null
      }
    })
    
    if (token1) {
      console.log('✅ تم العثور على التوكين في window')
      return token1
    }
    
    // الطريقة 2: البحث في HTML
    const html = await page.content()
    
    const patterns = [
      /"token":"([^"]+)"/,
      /token['"]?\s*:\s*['"]([^'"]+)/,
      /"accessToken":"([^"]+)"/,
      /authorization":\{"value":"([^"]+)"}/,
      /"value":"([A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+)"/,
      /"jwt":"([^"]+)"/
    ]
    
    for (const pattern of patterns) {
      const match = html.match(pattern)
      if (match && match[1]) {
        console.log('✅ تم العثور على التوكين في HTML')
        return match[1]
      }
    }
    
    // الطريقة 3: اعتراض طلبات الشبكة
    console.log('🔍 محاولة اعتراض طلبات الشبكة...')
    
    let networkToken = null
    
    await page.setRequestInterception(true)
    page.on('request', request => {
      const url = request.url()
      if (url.includes('hodor.canalplus.pro') && url.includes('token')) {
        const headers = request.headers()
        if (headers.authorization) {
          const match = headers.authorization.match(/Bearer\s+([^\s]+)/)
          if (match) networkToken = match[1]
        }
      }
      request.continue()
    })
    
    // إعادة تحميل الصفحة لاعتراض الطلبات
    await page.reload({ waitUntil: 'networkidle2' })
    await page.waitForTimeout(3000)
    
    if (networkToken) {
      console.log('✅ تم العثور على التوكين من طلبات الشبكة')
      return networkToken
    }
    
    console.log('❌ لم نتمكن من العثور على التوكين')
    return null
    
  } catch (error) {
    console.error('❌ خطأ في Puppeteer:', error.message)
    return null
  } finally {
    if (browser) await browser.close()
  }
}

async function getProgramsWithPuppeteer(channel, date) {
  let browser = null
  try {
    console.log(`🚀 استخدام Puppeteer لجلب برامج ${channel.name}...`)
    
    const [region, site_id] = channel.site_id.split('#')
    
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    })
    
    const page = await browser.newPage()
    
    // الذهاب إلى صفحة القناة
    const url = region === 'pl'
      ? `https://www.canalplus.com/pl/chaines/${site_id}/`
      : `https://www.canalplus.com/chaines/${site_id}/`
    
    console.log(`🌐 تحميل صفحة القناة: ${url}`)
    
    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 30000
    })
    
    await page.waitForTimeout(3000)
    
    // البحث عن بيانات البرامج في الصفحة
    const programs = await page.evaluate(() => {
      try {
        // البحث في window.__INITIAL_STATE__
        if (window.__INITIAL_STATE__ && window.__INITIAL_STATE__.broadcasts) {
          return window.__INITIAL_STATE__.broadcasts
        }
        
        // البحث في عناصر DOM
        const broadcasts = []
        const items = document.querySelectorAll('[data-testid="broadcast-item"], .broadcast-item, .program-item')
        
        items.forEach(item => {
          const title = item.querySelector('.title, .program-title')?.textContent
          const time = item.querySelector('.time, .start-time')?.textContent
          const description = item.querySelector('.description, .synopsis')?.textContent
          
          if (title) {
            broadcasts.push({
              title,
              description,
              startTime: time,
              programTitle: title
            })
          }
        })
        
        return broadcasts
      } catch (e) {
        return []
      }
    })
    
    if (programs.length > 0) {
      console.log(`✅ تم العثور على ${programs.length} برنامج`)
    }
    
    return programs
    
  } catch (error) {
    console.error('❌ خطأ في جلب البرامج:', error.message)
    return []
  } finally {
    if (browser) await browser.close()
  }
}

function parseItems(content) {
  try {
    if (!content || content.trim() === '') return []
    const data = JSON.parse(content)
    if (!data) return []
    
    if (Array.isArray(data.timeSlices)) {
      return data.timeSlices.flatMap(slice => slice.contents || [])
    } else if (Array.isArray(data.broadcasts)) {
      return data.broadcasts
    } else if (Array.isArray(data)) {
      return data
    }
    
    return []
  } catch (e) {
    return []
  }
}

function parseStart(item) {
  if (!item) return null
  const dateStr = item.startTime || item.start || item.start_date || item.broadcastDate
  if (!dateStr) return null
  const date = dayjs(dateStr)
  return date.isValid() ? date : null
}

async function loadProgramDetails(item) {
  if (!item) return null
  const url = item.onClick?.URLPage || item.detailUrl || item.url || item.link
  if (!url) return item
  
  try {
    const response = await http.get(url, {
      timeout: 10000,
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'X-Requested-With': 'XMLHttpRequest'
      }
    })
    return response.data
  } catch (error) {
    return item
  }
}

function parseInfo(data) {
  if (!data) return null
  return data.detail?.informations || 
         data.informations || 
         data.info ||
         data.details ||
         data.program ||
         data
}

function parseDescription(info) {
  if (!info) return null
  return info.summary || 
         info.description || 
         info.synopsis || 
         info.longDescription ||
         info.shortDescription ||
         null
}

function parseImage(info) {
  if (!info) return null
  return info.URLImage || 
         info.image || 
         info.picture || 
         info.thumbnail ||
         info.poster ||
         (info.images && (info.images.landscape || info.images.portrait)) ||
         null
}

function parseCast(info, type) {
  if (!info?.personnalities && !info?.cast) return []
  
  if (info.personnalities) {
    const block = info.personnalities.find(p => p.prefix === type)
    if (block?.personnalitiesList) {
      return block.personnalitiesList.map(p => p.title)
    }
  }
  
  return []
}

function parseDate(info) {
  if (!info) return null
  return info.productionYear || info.year || info.releaseDate || null
}

function parseRating(info) {
  if (!info?.parentalRatings) return null
  
  const rating = info.parentalRatings.find(r => r.authority === 'CSA')
  if (!rating || rating.value === '1') return null

  const map = {
    '2': '-10',
    '3': '-12',
    '4': '-16',
    '5': '-18'
  }

  return {
    system: rating.authority || 'CSA',
    value: map[rating.value] || rating.value
  }
      }
