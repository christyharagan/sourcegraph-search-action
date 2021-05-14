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
Object.defineProperty(exports, "__esModule", { value: true });
const core = __importStar(require("@actions/core"));
const github = __importStar(require("@actions/github"));
const perform_1 = require("./perform");
const domain_name = core.getInput('sourcegraph_domain_name');
const token = core.getInput('sourcegraph_api_token');
const org_name = core.getInput('sourcegraph_org_name');
const slack_token = core.getInput('slack_token');
const smtp_host = core.getInput('smtp_host');
const smtp_port = core.getInput('smtp_port');
const smtp_secure = core.getInput('smtp_secure');
const smtp_user = core.getInput('smtp_user');
const smtp_password = core.getInput('smtp_password');
if (github.context.payload.pull_request) {
    const branch = github.context.payload.pull_request.head.ref;
    const repo = github.context.payload.pull_request.head.repo.full_name;
    if (!github.context.payload.pull_request.html_url) {
        core.error('No URL for PR');
    }
    else {
        const pr_url = github.context.payload.pull_request.html_url;
        perform_1.perform({
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
        });
    }
}
