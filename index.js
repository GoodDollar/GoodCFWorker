// SLACK_TOKEN is used to authenticate requests are from Slack.
// Keep this value secret.
import _get from 'lodash/get'

const SLACK_TOKEN = process.env.SLACK_TOKEN
const BOT_NAME = 'GoodDolar Support'
const PRIVATE_DB_PASS = process.env.ETORO_DB_PASS
const AMPLITUDE_KEY = process.env.AMPLITUDE_KEY
const AMPLITUDE_SECRET = process.env.AMPLITUDE_SECRET
const SENTRY_PROJECT_ID = process.env.SENTRY_PROJECT
const SENTRY_KEY = process.env.SENTRY_KEY
const REAMAZE_USER = process.env.REAMAZE_USER
const REAMAZE_TOKEN = process.env.REAMAZE_TOKEN
const TRAVIS_TOKEN = process.env.TRAVIS_TOKEN
const slackValidChannels = ['etoro_feedback_qa', 'nordwhale']
const prodBranches = ['alphav3', 'beta']

addEventListener('fetch', event => {
  const url = event.request.url
  console.log({ url })
  const toMatch = `key=${AMPLITUDE_SECRET}`
  if (url.indexOf(toMatch) > 0) {
    event.respondWith(mauticWebhookHandler(event.request))
  } else event.respondWith(slackWebhookHandler(event.request))
})

const sentryEvent = async (exOrMsg, extra) => {
  let data
  if (typeof exOrMsg === 'string') {
    data = {
      message: exOrMsg,
      level: 'info',
      extra,
    }
  } else {
    data = {
      exception: {
        type: exOrMsg.message,
        value: exOrMsg.message,
        stacktrace: exOrMsg.stacktrace,
      },
      extra,
    }
  }
  console.log('sentry req', data, { SENTRY_PROJECT_ID, SENTRY_KEY })
  // const sentryUrl = 'https://webhook.site/feaf92f9-cf45-4358-a904-ec1acd40afbb'
  const sentryUrl = `https://sentry.io/api/${SENTRY_PROJECT_ID}/store/`
  // const sentryUrl = 'https://postman-echo.com/post'
  const res = await fetch(sentryUrl, {
    headers: {
      'Content-Type': 'application/json',
      'X-Sentry-Auth': `Sentry sentry_version=7,sentry_key=${SENTRY_KEY},sentry_client=raven-bash/1.0`,
      'User-Agent': 'curl/7.54.0',
      Accept: '*/*',
    },
    body: JSON.stringify(data),
    method: 'POST',
  }).then(r => r.text())
  console.log('sentry res:', res)
}

/**
 * forward mautic form to reamaze
 * @param {} events
 */
const forwardToReamaze = async event => {
  try {
    const userEmail =
      _get(event, 'submission.lead.fields.core.email.value') ||
      _get(event, 'submission.results.email', '')
    const formKey = _get(event, 'submission.form.name', '')
    const formData = JSON.stringify(
      _get(event, 'submission.results', ''),
      null,
      2,
    )
    // const formData = JSON.stringify(_get(event, 'submission.results', ''))

    const data = {
      conversation: {
        subject: `New Request - ${formKey}`,
        category: 'support',
        message: {
          body: formData,
          recipients: ['support@gooddollar.org'],
        },
        user: {
          email: userEmail,
        },
      },
    }
    console.log('forwardToReamaze:', data)
    const auth = btoa(`${REAMAZE_USER}:${REAMAZE_TOKEN}`)
    const res = await fetch(
      `https://gooddollar.reamaze.io/api/v1/conversations`,
      {
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(data),
        method: 'POST',
      },
    )
    console.log('reamaze response:', res.json())
  } catch (e) {
    console.log('forwardToReamze error:', e)
  }
}

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

const travisPost = async (repocmd, data) => {
  const tosend = {
    request: data,
  }
  const response = await fetch('https://api.travis-ci.com/repo/' + repocmd, {
    method: 'POST', // *GET, POST, PUT, DELETE, etc.
    headers: {
      'Content-Type': 'application/json',
      'Travis-API-Version': 3,
      Authorization: `token ${TRAVIS_TOKEN}`,
    },
    body: JSON.stringify(tosend), // body data type must match "Content-Type" header
  })
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
  let payload
  console.log({ cmd, msg })
  switch (cmd) {
    case '/release':
      let [DEPLOY_VERSION = 'prerelease', DEPLOY_FROM, DEPLOY_TO] = msg.split(
        ' ',
      )
      let data = {
        message: 'Triggering release from slack',
        config: {
          merge_mode: 'replace',
          language: 'node_js',
          node_js: ['10.15'],
          addons: {},
          cache: false,
          git: { depth: false },
          env: { global: { DEPLOY_VERSION, DEPLOY_FROM, DEPLOY_TO } },
          matrix: {},
          install: ['npm i -g auto-changelog'],
        },
        branch: DEPLOY_FROM,
      }
      console.log('slack release:', { data })
      let dapp, server
      switch (DEPLOY_VERSION) {
        default:
        case 'qa':
          data.config.env.global.DEPLOY_FROM = DEPLOY_FROM || 'master'
          data.config.env.global.DEPLOY_TO = DEPLOY_TO || 'staging'
          ;(data.config.script = [
            'git checkout $DEPLOY_FROM',
            'npm version $DEPLOY_VERSION -m "chore: release qa version %s [skip ci]"',
            'git push https://$GITHUB_AUTH@github.com/$TRAVIS_REPO_SLUG $DEPLOY_FROM --follow-tags',
            'git fetch origin $DEPLOY_TO:$DEPLOY_TO',
            'git checkout $DEPLOY_TO',
            'git push https://$GITHUB_AUTH@github.com/$TRAVIS_REPO_SLUG $DEPLOY_FROM:$DEPLOY_TO',
            'git fetch origin master:master',
            'git checkout master',
            'git merge $DEPLOY_FROM -m "Merge branch $DEPLOY_FROM [skip ci]"',
            'git push https://$GITHUB_AUTH@github.com/$TRAVIS_REPO_SLUG master',
          ]),
            (data.config.env.global.DEPLOY_VERSION =
              DEPLOY_VERSION === 'qa' ? 'prerelease' : DEPLOY_VERSION)
          dapp = travisPost('GoodDollar%2FGoodDAPP/requests', data)
          server = travisPost('GoodDollar%2FGoodServer/requests', data)
          return Promise.all([dapp, server])
          break
        case 'prod':
          data.config.env.global.DEPLOY_FROM = 'staging'
          data.config.env.global.DEPLOY_VERSION = 'minor'
          data.config.script = [
            'git checkout $DEPLOY_FROM',
            'npm version $DEPLOY_VERSION -m "chore: release version %s [skip ci]"',
            'git push https://$GITHUB_AUTH@github.com/$TRAVIS_REPO_SLUG $DEPLOY_FROM --follow-tags',
          ]
          prodBranches.forEach(b => {
            data.config.script.push(
              `git fetch origin ${b}:${b}`,
              `git checkout ${b}`,
              `git push https://$GITHUB_AUTH@github.com/$TRAVIS_REPO_SLUG $DEPLOY_FROM:${b}`,
            )
          })
          data.config.script.push(
            'git fetch origin master',
            'git checkout master',
            'git merge $DEPLOY_FROM -m "Merge branch $DEPLOY_FROM [skip ci]"',
            'git push https://$GITHUB_AUTH@github.com/$TRAVIS_REPO_SLUG master',
          )
          dapp = travisPost('GoodDollar%2FGoodDAPP/requests', data)
          server = travisPost('GoodDollar%2FGoodServer/requests', data)
          return Promise.all([dapp, server])
          break
      }

      break
    case '/getuser':
      console.log('getuser', { msg })
      payload = {
        password: PRIVATE_DB_PASS,
        email: msg,
      }
      if (msg.match(/\+?[0-9]+$/)) {
        payload.mobile = msg.indexOf('+') == 0 ? msg : `+${msg}`
        delete payload.email
      }
      console.log('getuser', { payload })
      return await goodserverPost('/admin/user/get', payload)
      break
    case '/deleteuser':
      if (!msg.match(/0x[0-9A-Fa-f]+$/)) {
        throw new Error('bad user identifier format')
      }
      payload = {
        password: PRIVATE_DB_PASS,
        identifier: msg,
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
    if (slackValidChannels.includes(formData.get('channel_name')) === false) {
      return simpleResponse(403, 'unauthorized channel')
    }
    const command = formData.get('command')
    const msg = formData.get('text') || ''
    // const args = await command.parse(msg)
    // const result = args.result
    const result = await handleCommand(command, msg)
    console.log('handleCommand:', { result })
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

const handleFormSubmitEvent = async events => {
  await Promise.all(events.map(async event => forwardToReamaze(event)))
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
    console.log('handleFormSubmit event:', { eventData })
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
    await sentryEvent('mauticWebhookHandler incoming', {
      eventKey,
      json,
    })
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
        console.log('amplitude response:', { res })
        break
    }
    return simpleResponse(200, `ok`)
  } catch (e) {
    return simpleResponse(400, `Sorry, couldn't perform your request: ${e}`)
  }
}
