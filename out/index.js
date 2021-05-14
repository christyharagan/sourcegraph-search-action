"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const cross_fetch_1 = __importDefault(require("cross-fetch"));
const core = __importStar(require("@actions/core"));
const github = __importStar(require("@actions/github"));
const nodemailer_1 = __importDefault(require("nodemailer"));
const EMAIL_REGEX = /\b([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})\b/;
const SLACK_REGEX = /\s*@([a-z0-9][a-z0-9._-]*)/;
const GET_SEARCHES_QUERY = `query {
  savedSearches {
    query,
    description,
    namespace {
    	namespaceName
  	}
  }
}`;
function create_message(pr_url, desc, type) {
    return `A PR has been issued that warrants your attention: ${type == 'html' ? `<a href="${pr_url}">${pr_url}</a>` : pr_url}. It matches the Sourcegraph saved search: ${desc}`;
}
async function send_email(addr, pr_url, desc, mailer) {
    await mailer.sendMail({
        from: 'no_reply@sourcegraph.com',
        to: addr,
        subject: 'PR Request requires your attention',
        text: create_message(pr_url, desc),
        html: create_message(pr_url, desc, 'html')
    });
}
async function send_slack(slack_channel, pr_url, desc, slack_token) {
    await cross_fetch_1.default(`https://slack.com/api/chat.postMessage`, {
        method: 'post',
        headers: {
            'authorization': `Bearer ${slack_token}`
        },
        body: JSON.stringify({
            channel: slack_channel,
            text: create_message(pr_url, desc)
        })
    });
}
async function perform() {
    const domain_name = core.getInput('sourcegraph_domain_name');
    const token = core.getInput('sourcegraph_api_token');
    const org_name = core.getInput('sourcegraph_org_name');
    const slack_token = core.getInput('slack_token');
    const smtp_host = core.getInput('smtp_host');
    const smtp_port = core.getInput('smtp_port');
    const smtp_secure = core.getInput('smtp_secure');
    const smtp_user = core.getInput('smtp_user');
    const smtp_password = core.getInput('smtp_password');
    const api_url = `https://${domain_name}/.api/graphql`;
    if (github.context.payload.pull_request) {
        const branch = github.context.payload.pull_request.head.ref;
        const repo = github.context.payload.pull_request.head.repo.full_name;
        core.info('Head: ' + JSON.stringify(github.context.payload.pull_request.head));
        core.info('Repo: ' + repo);
        core.info('Branch: ' + branch);
        const fetch_call = await cross_fetch_1.default(api_url, {
            method: 'post',
            headers: {
                Authorization: `token ${token}`
            },
            body: GET_SEARCHES_QUERY
        });
        const fetch_response = (await fetch_call.json());
        if (!github.context.payload.pull_request.html_url) {
            core.error('No URL for PR');
            return;
        }
        const pr_url = github.context.payload.pull_request.html_url;
        core.info('PR URL: ' + pr_url);
        const mailer = smtp_host ? nodemailer_1.default.createTransport({
            host: smtp_host,
            port: parseInt(smtp_port),
            secure: smtp_secure.toLowerCase() == 'true',
            auth: {
                user: smtp_user,
                pass: smtp_password
            }
        }) : undefined;
        fetch_response.data.savedSearches
            .filter(s => s.namespace.namespaceName == org_name)
            .forEach(async (s) => {
            core.info('Query: ' + s.query);
            const email_match = s.description.match(EMAIL_REGEX);
            const slack_match = s.description.match(SLACK_REGEX);
            const email = !email_match ? undefined : email_match[0];
            const slack = !slack_match ? undefined : slack_match[0];
            const searches_call = await cross_fetch_1.default(api_url, {
                method: 'post',
                headers: {
                    Authorization: `token ${token}`
                },
                body: `query {
            search(query: "${s.query} repo:${repo}$@${branch} type:diff") {
              results {
                matchCount
              }
            }
          }`
            });
            const search_response = (await searches_call.json());
            core.info(JSON.stringify(search_response));
            if (search_response.data.search.results.matchCount > 0) {
                if (email && mailer) {
                    send_email(email, pr_url, s.description, mailer);
                }
                if (slack && slack_token) {
                    core.info('Slack: ' + slack);
                    send_slack('@' + slack, pr_url, s.description, slack_token);
                }
            }
        });
    }
}
perform();
