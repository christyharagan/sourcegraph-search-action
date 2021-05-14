import fetch from 'cross-fetch'
import * as core from '@actions/core'
import * as github from '@actions/github'
import nodemailer from 'nodemailer'
import { Transporter } from 'nodemailer'

const EMAIL_REGEX = /\b([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})\b/
const SLACK_REGEX = /\s*@([a-z0-9][a-z0-9._-]*)/
const GET_SEARCHES_QUERY = `query {
  savedSearches {
    query,
    description,
    namespace {
    	namespaceName
  	}
  }
}`

type GetSavedSearchesResponse = {
  data: {
    savedSearches: {
      query: string
      description: string
      namespace: {
        namespaceName: string
      }
    }[]
  }
}

type RunSearchReponse = {
  data: {
    search: {
      results: {
        matchCount: number
      }
    }
  }
}

function create_message(pr_url: string, desc: string, type?: 'html') {
  return `A PR has been issued that warrants your attention: ${type == 'html' ? `<a href="${pr_url}">${pr_url}</a>` : pr_url}. It matches the Sourcegraph saved search: ${desc}`
}

async function send_email(addr: string, pr_url: string, desc: string, mailer: Transporter) {
  await mailer.sendMail({
    from: 'no_reply@sourcegraph.com',
    to: addr,
    subject: 'PR Request requires your attention',
    text: create_message(pr_url, desc),
    html: create_message(pr_url, desc, 'html')
  })
}

async function send_slack(slack_channel: string, pr_url: string, desc: string, slack_token: string) {
  await fetch(`https://slack.com/api/chat.postMessage`, {
    method: 'post',
    headers: {
      'authorization': `Bearer ${slack_token}`
    },
    body: JSON.stringify({
      channel: slack_channel,
      text: create_message(pr_url, desc)
    })
  })
}

async function perform() {
  const domain_name = core.getInput('sourcegraph_domain_name')
  const token = core.getInput('sourcegraph_api_token')
  const org_name = core.getInput('sourcegraph_org_name')
  const slack_token = core.getInput('slack_token')
  const smtp_host = core.getInput('smtp_host')
  const smtp_port = core.getInput('smtp_port')
  const smtp_secure = core.getInput('smtp_secure')
  const smtp_user = core.getInput('smtp_user')
  const smtp_password = core.getInput('smtp_password')

  const api_url = `https://${domain_name}/.api/graphql`

  if (github.context.payload.pull_request) {
    const branch = github.context.payload.pull_request.head.ref
    const repo = github.context.payload.pull_request.head.repo.full_name
    if (!github.context.payload.pull_request.html_url) {
      core.error('No URL for PR')
      return
    }
    const pr_url = github.context.payload.pull_request.html_url
    core.info('PR URL: ' + pr_url)
    core.info('Repo: ' + repo)
    core.info('Branch: ' + branch)

    const fetch_call = await fetch(api_url, {
      method: 'post',
      headers: {
        Authorization: `token ${token}`
      },
      body: JSON.stringify({ query: GET_SEARCHES_QUERY, variables: null })
    })
    let fetch_response: GetSavedSearchesResponse
    const t = await fetch_call.text()
    try {
      fetch_response = JSON.parse(t) as GetSavedSearchesResponse //(await fetch_call.json()) as GetSavedSearchesResponse
    } catch (e) {
      core.error(t)
      return
    }


    const mailer = smtp_host ? nodemailer.createTransport({
      host: smtp_host,
      port: parseInt(smtp_port),
      secure: smtp_secure.toLowerCase() == 'true',
      auth: {
        user: smtp_user,
        pass: smtp_password
      }
    }) : undefined

    fetch_response.data.savedSearches
      .filter(s => s.namespace.namespaceName == org_name)
      .forEach(async s => {
        core.info('Query: ' + s.query)
        const email_match = s.description.match(EMAIL_REGEX)
        const slack_match = s.description.match(SLACK_REGEX)
        const email = !email_match ? undefined : email_match[0]
        const slack = !slack_match ? undefined : slack_match[0]

        const searches_call = await fetch(api_url, {
          method: 'post',
          headers: {
            Authorization: `token ${token}`
          },
          body: JSON.stringify({
            query: `query {
  search(query: "${s.query} repo:${repo}$@${branch} type:diff") {
    results {
      matchCount
    }
  }
}`,
            variables: null
          })
        })
        let search_response: RunSearchReponse
        const t = await searches_call.text()
        try {
          search_response = JSON.parse(t) as RunSearchReponse //(await searches_call.json()) as RunSearchReponse
        } catch (e) {
          core.error(t)
          return
        }
        core.info(JSON.stringify(search_response))
        if (search_response.data.search.results.matchCount > 0) {
          if (email && mailer) {
            send_email(email, pr_url, s.description, mailer)
          }
          if (slack && slack_token) {
            core.info('Slack: ' + slack)
            send_slack('@' + slack, pr_url, s.description, slack_token)
          }
        }
      })

  }
}

perform()