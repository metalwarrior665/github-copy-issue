// Apify SDK - toolkit for building Apify Actors (Read more at https://docs.apify.com/sdk/js/)
import { Actor, log } from 'apify';
import { Octokit } from 'octokit';

interface Input {
    personalAccessToken: string;
    sourceIssueUrl: string;
    targetRepos: string[];
    checkForDuplicates?: boolean;
}

// The init() call configures the Actor for its environment. It's recommended to start every Actor with an init()
await Actor.init();

// Structure of input is defined in input_schema.json
const {
    personalAccessToken,
    sourceIssueUrl,
    targetRepos = [],
    checkForDuplicates = true,
} = await Actor.getInput<Input>() ?? {} as Input;

const octokit = new Octokit({
    auth: personalAccessToken,
});

const { pathname } = new URL(sourceIssueUrl);

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const [owner, repo, _issuesWord, issueNumber] = pathname.split('/').slice(1);

log.info(`Fetching issue ${issueNumber} from ${owner}/${repo}`);
const sourceIssue = await octokit.rest.issues.get({
    owner,
    repo,
    issue_number: Number(issueNumber),
}).then((res) => res.data);

for (const targetRepo of targetRepos) {
    if (checkForDuplicates) {
        const openedIssues = [];
        for (let page = 1; ; page++) {
            // Load all opened issues to check that we don't create one with duplicate title
            const pageOpenedIssues = await octokit.rest.issues.listForRepo({
                owner: targetRepo.split('/')[0],
                repo: targetRepo.split('/')[1],
                state: 'open',
                filter: 'repos',
                page,
            });

            await Actor.pushData(pageOpenedIssues.data);

            openedIssues.push(...pageOpenedIssues.data);

            log.info(`Checking ${targetRepo} for existing issues, loaded ${pageOpenedIssues.data.length} opened issues, total loaded ${openedIssues.length}`);

            if (pageOpenedIssues.data.length === 0) {
                break;
            }
        }

        if (openedIssues.some((issue) => issue.title === sourceIssue.title)) {
            log.info(`Issue with title ${sourceIssue.title} already exists in ${targetRepo}. Skipping.`);
            continue;
        }
    }

    const result = await octokit.rest.issues.create({
        owner: targetRepo.split('/')[0],
        repo: targetRepo.split('/')[1],
        title: sourceIssue.title,
        body: sourceIssue.body || '',
        labels: sourceIssue.labels,
    }).then((res) => res.data);

    log.info(`Copied issue to ${targetRepo}. New issue URL: ${result.html_url}`);
}

await Actor.exit();
