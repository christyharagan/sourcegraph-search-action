"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.perform = void 0;
const cross_fetch_1 = __importDefault(require("cross-fetch"));
const nodemailer_1 = __importDefault(require("nodemailer"));
const EMAIL_REGEX = /\b([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})\b/;
const SLACK_REGEX = /\s*(@[a-z0-9][a-z0-9._-]*)/;
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
function is_error(m) {
    return m.errors !== undefined;
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
    const r = await cross_fetch_1.default(`https://slack.com/api/chat.postMessage`, {
        method: 'post',
        headers: {
            'authorization': `Bearer ${slack_token}`,
            'Content-type': 'application/json'
        },
        body: JSON.stringify({
            channel: slack_channel,
            text: create_message(pr_url, desc)
        })
    });
    const t = await r.text();
    console.log(t);
    console.log(JSON.stringify({
        channel: slack_channel,
        text: create_message(pr_url, desc)
    }));
}
async function perform({ domain_name, org_name, slack_token, smtp_host, smtp_password, smtp_port, smtp_secure, smtp_user, token, repo, branch, pr_url, error }) {
    const api_url = `https://${domain_name}/.api/graphql`;
    const fetch_call = await cross_fetch_1.default(api_url, {
        method: 'post',
        headers: {
            Authorization: `token ${token}`
        },
        body: JSON.stringify({ query: GET_SEARCHES_QUERY, variables: null })
    });
    let fetch_response;
    const t = await fetch_call.text();
    try {
        fetch_response = JSON.parse(t); //(await fetch_call.json()) as GetSavedSearchesResponse
    }
    catch (e) {
        throw t;
    }
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
        const email_match = s.description.match(EMAIL_REGEX);
        const slack_match = s.description.match(SLACK_REGEX);
        const email = !email_match ? undefined : email_match[1];
        const slack = !slack_match ? undefined : slack_match[1];
        const query = `${s.query} repo:${repo}@${branch} type:diff`
            .replace(/\\n/g, "\\n")
            .replace(/\\'/g, "\\'")
            .replace(/\\"/g, '\\"')
            .replace(/\\&/g, "\\&")
            .replace(/\\r/g, "\\r")
            .replace(/\\t/g, "\\t")
            .replace(/\\b/g, "\\b")
            .replace(/\\f/g, "\\f");
        const searches_call = await cross_fetch_1.default(api_url, {
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
        });
        let search_response;
        const t = await searches_call.text();
        try {
            search_response = JSON.parse(t);
        }
        catch (e) {
            throw t;
        }
        if (is_error(search_response)) {
            error('Error executing: ' + s.description);
            error(JSON.stringify(search_response));
        }
        else {
            if (search_response.data.search.results.matchCount > 0) {
                if (email && mailer) {
                    send_email(email, pr_url, s.description, mailer);
                }
                if (slack && slack_token) {
                    send_slack(slack, pr_url, s.description, slack_token);
                }
            }
        }
    });
}
exports.perform = perform;
