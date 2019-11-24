// SLACK_TOKEN is used to authenticate requests are from Slack.
// Keep this value secret.
import _get from 'lodash/get'

const SLACK_TOKEN = process.env.SLACK_TOKEN
const BOT_NAME = 'GoodDolar Support'
const PRIVATE_DB_PASS = process.env.ETORO_DB_PASS
const AMPLITUDE_KEY = process.env.AMPLITUDE_KEY
const AMPLITUDE_SECRET = process.env.AMPLITUDE_SECRET

addEventListener('fetch', event => {
  const url = event.request.url
  console.log({ url })
  const toMatch = `key=${AMPLITUDE_SECRET}`
  if (url.indexOf(toMatch) > 0) {
    event.respondWith(mauticWebhookHandler(event.request))
  } else event.respondWith(slackWebhookHandler(event.request))
})

const goodserverPost = async (cmd, data) => {
  const response = await fetch(
    'https://etoro-server-production.herokuapp.com' + cmd,
    {
      method: 'POST', // *GET, POST, PUT, DELETE, etc.
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data), // body data type must match "Content-Type" header
    },
  )
  return response.json()
}

const amplitudePost = async events => {
  const data = {
    api_key: process.env.AMPLITUDE_KEY,
    events,
  }
  const response = await fetch('https://api.amplitude.com/2/httpapi', {
    method: 'POST', // *GET, POST, PUT, DELETE, etc.
    headers: {
      'Content-Type': 'application/json',
      Accept: '*/*',
    },
    body: JSON.stringify(data), // body data type must match "Content-Type" header
  })
  return response.json()
}
const handleCommand = async (cmd, msg) => {
  const data = msg
  let payload
  console.log({ cmd, data })
  switch (cmd) {
    case '/getuser':
      payload = {
        password: PRIVATE_DB_PASS,
        email: data,
      }
      if (data.match(/\+?[0-9]+$/)) {
        payload.mobile = data.indexOf('+') == 0 ? data : `+${data}`
        delete payload.email
      }
      console.log({ payload })
      return await goodserverPost('/admin/user/get', payload)
      break
    case '/deleteuser':
      if (!data.match(/0x[0-9A-Fa-f]+$/)) {
        throw new Error('bad user identifier format')
      }
      payload = {
        password: PRIVATE_DB_PASS,
        identifier: data,
      }

      console.log({ payload })
      return await goodserverPost('/admin/user/delete', payload)
      break
    default:
      throw new Error(`unknown command ${cmd}`)
  }
}
let jsonHeaders = new Headers([['Content-Type', 'application/json']])

/**
 * simpleResponse generates a simple JSON response
 * with the given status code and message.
 *
 * @param {Number} statusCode
 * @param {String} message
 */
function simpleResponse(statusCode, message) {
  let resp = {
    response_type: 'ephemeral',
    text: message,
  }

  return new Response(JSON.stringify(resp), {
    headers: jsonHeaders,
    status: statusCode,
  })
}

/**
 * slackResponse builds a message for Slack with the given text
 * and optional attachment text
 *
 * @param {string} text - the message text to return
 */
function slackResponse(text) {
  let content = {
    text: text,
    attachments: [],
  }

  return new Response(JSON.stringify(content), {
    headers: jsonHeaders,
    status: 200,
  })
}

/**
 * slackWebhookHandler handles an incoming Slack
 * webhook and generates a response.
 * @param {Request} request
 */
async function slackWebhookHandler(request) {
  // As per: https://api.slack.com/slash-commands
  // - Slash commands are outgoing webhooks (POST requests)
  // - Slack authenticates via a verification token.
  // - The webhook payload is provided as POST form data

  if (request.method !== 'POST') {
    return simpleResponse(
      200,
      `Hi, I'm ${BOT_NAME}, a Slack bot for GoodDollar`,
    )
  }

  try {
    let formData = await request.formData()
    if (formData.get('token') !== SLACK_TOKEN) {
      return simpleResponse(403, 'invalid Slack verification token')
    }
    if (formData.get('channel_name') !== 'etoro_feedback_qa') {
      return simpleResponse(403, 'unauthorized channel')
    }
    const command = formData.get('command')
    const msg = formData.get('text')
    // const args = await command.parse(msg)
    // const result = args.result
    const result = await handleCommand(command, msg)
    const asText = `\`\`\`${JSON.stringify(result, null, ' ')}\`\`\``
    return slackResponse(asText)
  } catch (e) {
    return simpleResponse(200, `Sorry, couldn't perform your request: ${e}`)
  }
}

const handleEmailOpenEvent = events => {
  const eventsData = events.map(event => {
    const user_id =
      _get(event, 'stat.lead.fields.core.email.value') ||
      _get(event, 'stat.email')
    const mauticId = _get(event, 'stat.lead.id')
    const emailKey = _get(event, 'stat.email.name', '')
      .toUpperCase()
      .replace(/\s+/g, '_')
    const emailId = _get(event, 'stat.email.id', 0)
    const event_type = 'MAUTIC_EMAIL_OPEN'
    const eventData = {
      user_id,
      event_type,
      event_properties: {
        emailId,
        emailKey,
      },
      user_properties: {
        mauticId,
      },
    }
    console.log({ eventData })
    return eventData
  })
  return amplitudePost(eventsData)
}
const handleFormSubmitEvent = events => {
  const eventsData = events.map(event => {
    const user_id = _get(event, 'submission.lead.fields.core.email.value')
    const mauticId = _get(event, 'submission.lead.id')
    const formKey = _get(event, 'submission.form.name', '')
      .toUpperCase()
      .replace(/\s+/g, '_')
    const formId = _get(event, 'submission.form.id', 0)
    const event_type = 'MAUTIC_FORM_SUBMIT'
    const eventData = {
      user_id,
      event_type,
      event_properties: {
        formId,
        formKey,
      },
      user_properties: {
        mauticId,
      },
    }
    console.log({ eventData })
    return eventData
  })
  return amplitudePost(eventsData)
}
/**
 * mauticWebhookHandler handles an incoming mautic
 * webhook and generates amplitude event.
 * @param {Request} request
 */
async function mauticWebhookHandler(request) {
  if (request.method !== 'POST') {
    return simpleResponse(400, `Hi, I'm ${BOT_NAME}, expecting post request`)
  }

  let res
  try {
    const json = await request.json()
    const eventKey = Object.keys(json)
      .filter(_ => _.indexOf('mautic.') === 0)
      .pop()
    const events = Array.isArray(json[eventKey])
      ? json[eventKey]
      : [json[eventKey]]
    console.log({ eventKey })
    switch (eventKey) {
      case 'mautic.email_on_open':
        res = await handleEmailOpenEvent(events)
        console.log({ res })
        break
      case 'mautic.form_on_submit':
        res = await handleFormSubmitEvent(events)
        console.log({ res })
        break
    }
    return simpleResponse(200, `ok`)
  } catch (e) {
    return simpleResponse(400, `Sorry, couldn't perform your request: ${e}`)
  }
}
