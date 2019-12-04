const axios = require("axios");
const R = require("ramda");
const parse = require("json2csv").parse;
const fs = require("fs");

const baseURL = "https://yaya-dev.atlassian.net/rest/api/2";
const username = "yaya-dev";

const writeFile = filename => (content) => fs.writeFileSync(filename, content);

const jira = axios.create({
  baseURL,
  auth: {
    username: process.env.JIRA_USER,
    password: process.env.JIRA_PASSWORD
  }
});


const transformData = R.compose(
  R.over(R.lensProp("worklog"), R.compose(
    R.map(R.over(R.lensProp("author"), R.prop("displayName"))),
    R.map(R.pick(["author", "created", "timeSpentSeconds"])),
    R.prop("worklogs")
  )),
  R.pick(["summary", "worklog"]),
)

const flatIssueField = R.compose(
    R.omit("fields"),
    R.merge(R.prop("fields", issue))
  )

const getWorklogData = R.compose(
    R.join("\n"),
    R.map(R.compose(
      R.join("\t"),
      R.values,
      R.assoc("summary", R.prop("summary", issue)),
      R.assoc("key", R.prop("key", issue))
    )),
    R.prop("worklog")
  )

const issueKey = "YCS-11";

jira
  .get(`/issue/${issueKey}`)
  .then(R.prop("data"))
  .then(R.pick(["key", "fields"]))
  .then(R.over(R.lensProp("fields"), transformData))
  .then(flatIssueField)
  .then(getWorklogData)
  .then(writeFile(`${issueKey.toLowerCase()}.csv`))
  .catch(console.log);
