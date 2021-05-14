import fetch from 'cross-fetch'
import nodemailer from 'nodemailer'
import { Transporter } from 'nodemailer'

const EMAIL_REGEX = /\b([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})\b/
const SLACK_REGEX = /\s*(@[a-z0-9][a-z0-9._-]*)/
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

type RunSearchErrorResponse = {
  errors: { message: string, locations: { line: number, column: number }[] }[]
}

function create_message(pr_url: string, desc: string, type?: 'html') {
  return `A PR has been issued that warrants your attention: ${type == 'html' ? `<a href="${pr_url}">${pr_url}</a>` : pr_url}. It matches the Sourcegraph saved search: ${desc}`
}

function is_error(m: RunSearchReponse | RunSearchErrorResponse): m is RunSearchErrorResponse {
  return (m as RunSearchErrorResponse).errors !== undefined
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
  const r = await fetch(`https://slack.com/api/chat.postMessage`, {
    method: 'post',
    headers: {
      'authorization': `Bearer ${slack_token}`,
      'Content-type': 'application/json'
    },
    body: JSON.stringify({
      channel: slack_channel,
      text: create_message(pr_url, desc)
    })
  })
  const t = await r.text()
  console.log(t)
  console.log(JSON.stringify({
    channel: slack_channel,
    text: create_message(pr_url, desc)
  }))
}

export type Perform = {
  domain_name: string
  token: string
  org_name: string
  slack_token: string
  smtp_host: string
  smtp_port: string
  smtp_secure: string
  smtp_user: string
  smtp_password: string
  branch: string
  repo: string
  pr_url: string
  error: (msg: string) => void
}

export async function perform({ domain_name, org_name, slack_token, smtp_host, smtp_password, smtp_port, smtp_secure, smtp_user, token, repo, branch, pr_url, error }: Perform) {
  const api_url = `https://${domain_name}/.api/graphql`

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
    throw t
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
      const email_match = s.description.match(EMAIL_REGEX)
      const slack_match = s.description.match(SLACK_REGEX)
      const email = !email_match ? undefined : email_match[1]
      const slack = !slack_match ? undefined : slack_match[1]

      const query = `${s.query} repo:${repo}@${branch} type:diff`
        .replace(/\\n/g, "\\n")
        .replace(/\\'/g, "\\'")
        .replace(/\\"/g, '\\"')
        .replace(/\\&/g, "\\&")
        .replace(/\\r/g, "\\r")
        .replace(/\\t/g, "\\t")
        .replace(/\\b/g, "\\b")
        .replace(/\\f/g, "\\f")

      const searches_call = await fetch(api_url, {
        method: 'post',
        headers: {
          Authorization: `token ${token}`
        },
        body: JSON.stringify({
          query: `query {
  search(query: "${query}") {
    results {
      matchCount
    }
  }
}`,
          variables: null
        })
      })
      let search_response: RunSearchReponse | RunSearchErrorResponse
      const t = await searches_call.text()
      try {
        search_response = JSON.parse(t) as RunSearchReponse | RunSearchErrorResponse
      } catch (e) {
        throw t
      }
      if (is_error(search_response)) {
        error('Error executing: ' + s.description)
        error(JSON.stringify(search_response))
      } else {
        if (search_response.data.search.results.matchCount > 0) {
          if (email && mailer) {
            send_email(email, pr_url, s.description, mailer)
          }
          if (slack && slack_token) {
            send_slack(slack, pr_url, s.description, slack_token)
          }
        }
      }
    })
}