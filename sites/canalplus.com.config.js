const dayjs = require('dayjs')
const axios = require('axios')
const utc = require('dayjs/plugin/utc')

dayjs.extend(utc)

/**
 * Axios instance with enhanced browser-like headers
 */
const http = axios.create({
  timeout: 60000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    'Referer': 'https://www.canalplus.com/',
    'Origin': 'https://www.canalplus.com',
    'Connection': 'keep-alive',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'same-origin',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1',
    'Cache-Control': 'max-age=0'
  }
})

module.exports = {
  site: 'canalplus.com',
  days: 2,

  /**
   * Build API URL with better token extraction
   */
  url: async function ({ channel, date }) {
    try {
      const [region, site_id] = channel.site_id.split('#')
      
      // Try multiple methods to get token
      let token = null
      
      // Method 1: From homepage
      if (!token) {
        token = await getTokenFromHomepage(region)
      }
      
      // Method 2: Direct API attempt
      if (!token) {
        token = await getTokenDirect(region)
      }
      
      if (!token) {
        console.error('❌ Failed to get token for region:', region)
        return null
      }

      const path = region === 'pl' ? 'mycanalint' : 'mycanal'
      const diff = date.diff(dayjs.utc().startOf('d'), 'd')

      return `https://hodor.canalplus.pro/api/v2/${path}/channels/${token}/${site_id}/broadcasts/day/${diff}`
    } catch (error) {
      console.error('❌ Error building URL:', error.message)
      return null
    }
  },

  /**
   * Parse programs JSON → EPG items
   */
  async parser({ content }) {
    let programs = []
    const items = parseItems(content)

    for (let item of items) {
      try {
        const prev = programs[programs.length - 1]
        const details = await loadProgramDetails(item)
        const info = parseInfo(details)
        const start = parseStart(item)

        if (!start) continue
        if (prev) prev.stop = start

        const stop = start.add(1, 'hour')

        programs.push({
          title: item.title || '',
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
          stop
        })
      } catch (error) {
        console.error('❌ Error processing program:', error.message)
        continue
      }
    }

    return programs
  },

  /**
   * Auto channel loader (optional)
   */
  async channels({ country }) {
    const paths = {
      ad: 'cpafr/ad',
      bf: 'cpafr/bf',
      bi: 'cpafr/bi',
      bj: 'cpafr/bj',
      bl: 'cpant/bl',
      cd: 'cpafr/cd',
      cf: 'cpafr/cf',
      cg: 'cpafr/cg',
      ch: 'cpche',
      ci: 'cpafr/ci',
      cm: 'cpafr/cm',
      cv: 'cpafr/cv',
      dj: 'cpafr/dj',
      fr: 'cpfra',
      ga: 'cpafr/ga',
      gf: 'cpant/gf',
      gh: 'cpafr/gh',
      gm: 'cpafr/gm',
      gn: 'cpafr/gn',
      gp: 'cpafr/gp',
      gw: 'cpafr/gw',
      ht: 'cpant/ht',
      mf: 'cpant/mf',
      mg: 'cpafr/mg',
      ml: 'cpafr/ml',
      mq: 'cpant/mq',
      mr: 'cpafr/mr',
      mu: 'cpmus/mu',
      nc: 'cpncl/nc',
      ne: 'cpafr/ne',
      pf: 'cppyf/pf',
      pl: 'cppol',
      re: 'cpreu/re',
      rw: 'cpafr/rw',
      sl: 'cpafr/sl',
      sn: 'cpafr/sn',
      td: 'cpafr/td',
      tg: 'cpafr/tg',
      wf: 'cpncl/wf',
      yt: 'cpreu/yt'
    }

    const path = paths[country]
    if (!path) return []

    const url = `https://secure-webtv-static.canal-plus.com/metadata/${path}/all/v2.2/globalchannels.json`

    const data = await http
      .get(url)
      .then(r => r.data)
      .catch(err => {
        console.error('❌ Channels load failed:', err.message)
        return null
      })

    if (!data || !data.channels) return []

    return data.channels
      .filter(c => c.name && c.name !== '.')
      .map(channel => ({
        lang: 'fr',
        site_id: country === 'fr' ? `#${channel.id}` : `${country}#${channel.id}`,
        name: channel.name
      }))
  }
}

/* ===================== IMPROVED HELPERS ===================== */

async function getTokenFromHomepage(region) {
  try {
    const baseUrl = region === 'pl' 
      ? 'https://www.canalplus.com/pl/program-tv/' 
      : 'https://www.canalplus.com/programme-tv/'
    
    console.log('🔍 Attempting to get token from:', baseUrl)
    
    const response = await http.get(baseUrl, {
      headers: {
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      }
    })
    
    const html = response.data.toString()
    
    // Try multiple token patterns
    const patterns = [
      /"token":"([^"]+)"/,
      /token['"]?\s*:\s*['"]([^'"]+)/,
      /"accessToken":"([^"]+)"/,
      /authorization":\{"value":"([^"]+)"}/,
      /"value":"([A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+)"/ // JWT pattern
    ]
    
    for (const pattern of patterns) {
      const match = html.match(pattern)
      if (match && match[1]) {
        console.log('✅ Token found successfully')
        return match[1]
      }
    }
    
    console.log('⚠️ No token found in homepage')
    return null
  } catch (error) {
    console.error('❌ Failed to load homepage:', error.message)
    return null
  }
}

async function getTokenDirect(region) {
  try {
    console.log('🔍 Attempting direct token API...')
    
    // Try different token endpoints
    const endpoints = [
      'https://hodor.canalplus.pro/api/v2/mycanal/token',
      'https://hodor.canalplus.pro/api/v2/mycanalint/token',
      'https://secure-webtv-static.canal-plus.com/token.json'
    ]
    
    for (const endpoint of endpoints) {
      try {
        const response = await http.get(endpoint, {
          headers: {
            'Authorization': 'Basic ' + Buffer.from('mycanal:mycanal').toString('base64')
          },
          timeout: 5000
        })
        
        if (response.data?.token) {
          console.log('✅ Token found via direct API')
          return response.data.token
        }
      } catch (e) {
        // Continue to next endpoint
      }
    }
    
    return null
  } catch (error) {
    return null
  }
}

function parseItems(content) {
  try {
    if (!content || content.trim() === '') {
      console.log('⚠️ Empty content received')
      return []
    }
    
    const data = JSON.parse(content)
    
    if (!data) {
      console.log('⚠️ No data in response')
      return []
    }
    
    // Handle different response structures
    if (Array.isArray(data.timeSlices)) {
      return data.timeSlices.flatMap(slice => slice.contents || [])
    } else if (Array.isArray(data.broadcasts)) {
      return data.broadcasts
    } else if (Array.isArray(data)) {
      return data
    }
    
    console.log('⚠️ Unknown response structure')
    return []
  } catch (e) {
    console.error('❌ Error parsing JSON:', e.message)
    return []
  }
}

function parseStart(item) {
  if (!item) return null
  
  // Try different date fields
  const dateStr = item.startTime || item.start || item.start_date || item.broadcastDate
  
  if (!dateStr) return null
  
  const date = dayjs(dateStr)
  return date.isValid() ? date : null
}

async function loadProgramDetails(item) {
  if (!item) return null
  
  // Try different URL fields
  const url = item.onClick?.URLPage || item.detailUrl || item.url || item.link
  
  if (!url) return item // Return item itself if no detail URL
  
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
    return item // Return original item on error
  }
}

function parseInfo(data) {
  if (!data) return null
  
  // Try different info paths
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
         (info.images && (info.images.landscape || info.images.portrait || info.images.thumbnail)) ||
         null
}

function parseCast(info, type) {
  if (!info?.personnalities && !info?.cast) return []
  
  // Try personnalities first
  if (info.personnalities) {
    const block = info.personnalities.find(p => p.prefix === type)
    if (block?.personnalitiesList) {
      return block.personnalitiesList.map(p => p.title)
    }
  }
  
  // Try cast array
  if (info.cast) {
    const roleMap = {
      'Avec :': 'actors',
      'De :': 'directors',
      'Scénario :': 'writers',
      'Musique :': 'composers',
      'Présenté par :': 'presenters'
    }
    
    const role = roleMap[type]
    if (role && info.cast[role]) {
      return info.cast[role]
    }
  }
  
  return []
}

function parseDate(info) {
  if (!info) return null
  
  return info.productionYear || 
         info.year || 
         info.releaseDate ||
         info.date ||
         null
}

function parseRating(info) {
  if (!info?.parentalRatings && !info?.rating) return null
  
  // Try parentalRatings
  if (info.parentalRatings) {
    const rating = info.parentalRatings.find(r => r.authority === 'CSA')
    if (rating && rating.value !== '1') {
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
  }
  
  // Try simple rating
  if (info.rating) {
    return {
      system: 'CSA',
      value: info.rating
    }
  }
  
  return null
}
