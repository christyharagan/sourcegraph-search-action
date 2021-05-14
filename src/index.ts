import * as core from '@actions/core'
import * as github from '@actions/github'
import { perform } from './perform'

const domain_name = core.getInput('sourcegraph_domain_name')
const token = core.getInput('sourcegraph_api_token')
const org_name = core.getInput('sourcegraph_org_name')
const slack_token = core.getInput('slack_token')
const smtp_host = core.getInput('smtp_host')
const smtp_port = core.getInput('smtp_port')
const smtp_secure = core.getInput('smtp_secure')
const smtp_user = core.getInput('smtp_user')
const smtp_password = core.getInput('smtp_password')

if (github.context.payload.pull_request) {
  const branch = github.context.payload.pull_request.head.ref
  const repo = github.context.payload.pull_request.head.repo.full_name
  if (!github.context.payload.pull_request.html_url) {
    core.error('No URL for PR')
  } else {
    const pr_url = github.context.payload.pull_request.html_url

    perform({
      domain_name,
      org_name,
      slack_token,
      smtp_host,
      smtp_password,
      smtp_port,
      smtp_secure,
      smtp_user,
      token,
      branch,
      repo,
      pr_url,
      error: core.error
    })
  }
}