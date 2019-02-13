/**
 * Есть файл со списком репозиториев
 * Можно проверить какие репозитории существуют, а каких нет
 * По каждому пройтись получить данные из API
 * По шаблону сгенерировать html-отчёт
 */

const Promise = require("bluebird");
const axios = require("axios");
const R = require("ramda");
const pug = require("pug");
const fs = require("fs");

const refreshToken = require("./refreshBitbucketToken");

const fsAsync = Promise.promisifyAll(fs);
global.Promise = Promise;

const reportGenerator = pug.compileFile('./view/report.pug');

const username = "yaya-dev";

const process = async () => {
  // Get auth token
  const authToken = await refreshToken();
  
  // Init bitbucket api
  const bitbucket = axios.create({
    baseURL: "https://api.bitbucket.org/2.0",
    headers: {
      Authorization:
        `Bearer ${authToken}`
    }
  });

  // Read from file and request repo list concurrently
  const [projects, repositoryNames] = await Promise.all([
    fsAsync.readFileAsync("./projects.txt", "utf8").then(R.split("\n")),
    bitbucket.get(`/repositories/${username}?pagelen=100`).then(
      R.compose(
        R.pluck("name"),
        R.reject(R.pathEq(["project", "name"], "yaya-fifa")),
        R.reject(R.pathEq(["project", "name"], "yaya-archive")),
        R.path(["data", "values"])
      )
    )
  ]);

  // Check if all projects in file exists in bitbucket
  const listOfOutDateProjects = R.difference(projects, repositoryNames);
  if (R.not(R.isEmpty(listOfOutDateProjects))) {
    console.log("These projects are not in bitbucket:");
    console.log(R.sortBy(R.identity, listOfOutDateProjects));
  }

  // Get repositories that not in project list
  const listOfNotUsedRepositories = R.difference(repositoryNames, projects);
  if (R.not(R.isEmpty(listOfNotUsedRepositories))) {
    console.log("These repositories are not used:");
    console.log(R.sortBy(R.identity, listOfNotUsedRepositories));
  }

  // Get data for all repositories for projects in file. 
  // All requests are fire sequentially
  // repositoriesData : List BitBucketRepository
  const repositoryDataList = await Promise.mapSeries(
    projects,
    project =>
      bitbucket
        .get(`/repositories/${username}/${project}`)
        .then(R.prop("data"))
  );

  // For each repository get additional information about tags, branches and pull requests
  // repositoriesData : List BitBucketRepositoryExtend
  const extendRepoDataList = await Promise.mapSeries(
    repositoryDataList,
    async repo => {
      const tagsLink = R.path(["links", "tags", "href"], repo);
      const branchesLink = R.path(["links", "branches", "href"], repo);
      const pullRequestsLink = R.path(["links", "pullrequests", "href"], repo);

      const [tagData, branchesData, pullRequestsData] = await Promise.mapSeries(
        [tagsLink, branchesLink, pullRequestsLink],
        link => bitbucket.get(link).then(R.path(["data", "values"]))
      );

      return {
        ...repo,
        tags: tagData,
        branches: branchesData,
        pullRequests: pullRequestsData
      };
    }
  );

  await fsAsync.writeFileAsync('./report.html', reportGenerator({
    repoList: extendRepoDataList
  }))

  return "Done";
};

process()
  .then(console.log)
  .catch(console.error);
