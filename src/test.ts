import { perform } from './perform'

perform({
  branch: 'main',
  domain_name: 'demo.sourcegraph.com',
  org_name: 'acme-corp',
  pr_url: 'https://hello.world',
  repo: 'sourcegraph/src-cli',
  slack_token: '',
  token: '<<INSERT>>',
  smtp_host: '',
  smtp_password: '',
  smtp_port: '',
  smtp_secure: '',
  smtp_user: '',
  error: msg => {
    console.error(msg)
  }
}).catch(e => {
  console.error(typeof e === 'string' ? e : JSON.stringify(e))
})
