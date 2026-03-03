const dayjs = require('dayjs')
const axios = require('axios')
const utc = require('dayjs/plugin/utc')

dayjs.extend(utc)

/**
 * Axios instance with browser-like headers
 * This is REQUIRED to avoid 403 on GitHub Actions
 */
const http = axios.create({
  timeout: 30000,
  headers: {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    Accept: 'text/html,application/xhtml+xml,application/json',
    'Accept-Language': 'fr-FR,fr;q=0.9',
    Referer: 'https://www.canalplus.com/',
    Connection: 'keep-alive'
  }
})

module.exports = {
  site: 'canalplus.com',
  days: 2,

  /**
   * Build API URL
   */
  url: async function ({ channel, date }) {
    const [region, site_id] = channel.site_id.split('#')

    const baseUrl =
      region === 'pl'
        ? 'https://www.canalplus.com/pl/program-tv/'
        : `https://www.canalplus.com/${region}/programme-tv/`

    // Load HTML page to extract token
    const html = await http
      .get(baseUrl)
      .then(r => r.data.toString())
      .catch(err => {
        console.error('Failed to load Canal+ page:', err.message)
        return null
      })

    if (!html) return null

    const token = parseToken(html)
    if (!token) {
      console.error('Canal+ token not found')
      return null
    }

    const path = region === 'pl' ? 'mycanalint' : 'mycanal'
    const diff = date.diff(dayjs.utc().startOf('d'), 'd')

    return `https://hodor.canalplus.pro/api/v2/${path}/channels/${token}/${site_id}/broadcasts/day/${diff}`
  },

  /**
   * Parse programs JSON → EPG items
   */
  async parser({ content }) {
    let programs = []
    const items = parseItems(content)

    for (let item of items) {
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
        console.error('Channels load failed:', err.message)
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

/* ===================== HELPERS ===================== */

function parseToken(data) {
  const match = data.match(/"token":"([^"]+)"/)
  return match ? match[1] : null
}

function parseItems(content) {
  try {
    const data = JSON.parse(content)
    if (!data || !Array.isArray(data.timeSlices)) return []
    return data.timeSlices.flatMap(slice => slice.contents || [])
  } catch (e) {
    return []
  }
}

function parseStart(item) {
  return item && item.startTime ? dayjs(item.startTime) : null
}

async function loadProgramDetails(item) {
  if (!item?.onClick?.URLPage) return null
  return await http
    .get(item.onClick.URLPage)
    .then(r => r.data)
    .catch(() => null)
}

function parseInfo(data) {
  return data?.detail?.informations || null
}

function parseDescription(info) {
  return info?.summary || null
}

function parseImage(info) {
  return info?.URLImage || null
}

function parseCast(info, type) {
  if (!info?.personnalities) return []
  const block = info.personnalities.find(p => p.prefix === type)
  return block?.personnalitiesList?.map(p => p.title) || []
}

function parseDate(info) {
  return info?.productionYear || null
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
    system: rating.authority,
    value: map[rating.value] || rating.value
  }
}
