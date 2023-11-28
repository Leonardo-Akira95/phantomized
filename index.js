#!/usr/bin/env node
const { spawn, execSync } = require('child_process');
const Github = require('github');
const R  = require('ramda');

const fs = require('fs/promises');
const { promisify } = require('util');
const request = require('request');

const requestPromise = promisify(request)


function spawnAsync(cmd) {
  const options = {
    env: process.env,
    stdio: 'inherit'
  };

  const parameters = R.filter(R.identity, cmd.replace(/ \\n/g, '').replace('\t', '').split(' '));
  const executable = parameters[0];
  parameters.shift();

  console.log(executable, parameters);

  return new Promise(resolve => {
    const proc = spawn(executable, parameters, options);
    proc.on('close', code => {
      if (code !== 0) process.exit(code);
      resolve();
    });
  });
}

if (!process.env.PHANTOM_VERSION) {
  console.log('Phantom version is missing from env. Exiting...');
  process.exit(1);
}

console.log(`Downloading PhantomJS ${process.env.PHANTOM_VERSION}`);
const download_options = {
  url: `https://bitbucket.org/ariya/phantomjs/downloads/phantomjs-${process.env.PHANTOM_VERSION}-linux-x86_64.tar.bz2`,
  encoding: null
};


function releaseToGithub() {
  const github = new Github({
    version: '3.0.0',
    protocol: 'https',
    timeout: 5000,
    headers: {
      'user-agent': 'Phantomized-Gulp-Release'
    }
  });
  github.authenticate({
    type: 'oauth',
    token: process.env.GITHUB_TOKEN
  });
  const releases = Promise.promisifyAll(github.releases);

  console.log('Uploading release to Github');
  process.chdir('../');
  return releases.createReleaseAsync({
    owner: 'Gravebot',
    repo: 'phantomized',
    tag_name: process.env.PHANTOM_VERSION,
    draft: true,
    name: `Phantomized ${process.env.PHANTOM_VERSION}`
  })
  .then(release => releases.uploadAssetAsync({
    owner: 'Gravebot',
    repo: 'phantomized',
    id: release.id,
    name: 'dockerized-phantomjs.tar.gz',
    filePath: './dockerized-phantomjs.tar.gz'
  }));
}

requestPromise(download_options)
  .then(res => fs.writeFile('./phantomjs.tar.bz2', res.body, null))
  .then(() => console.log('Extracting'))
  .then(() => spawnAsync('tar -jxvf ./phantomjs.tar.bz2'))
  .then(() => fs.copyFile(`./phantomjs-${process.env.PHANTOM_VERSION}-linux-x86_64/bin/phantomjs`, '/usr/local/bin/phantomjs'))
  .then(() => {
    console.log('Running dockerize');
    const cmd = `dockerize -n -o dockerized-phantomjs \
    -e /usr/local/bin/phantomjs \
    -a /bin/dash /bin/sh \
    -a /etc/fonts /etc \
    -a /etc/ssl /etc \
    -a /usr/share/fonts /usr/share \
    --verbose \
    /usr/local/bin/phantomjs \
    /usr/bin/curl`;
    return spawnAsync(cmd);
  })
  .then(() => fs.rm('./dockerized-phantomjs/Dockerfile'))
  .then(() => fs.rm('./dockerized-phantomjs/usr/local/bin/phantomjs'))
  .then(() => {
    console.log('Taring archive');
    process.chdir('./dockerized-phantomjs');
    return execSync('tar -zcf ../dockerized-phantomjs.tar.gz ./lib ./lib64 ./usr/lib');
  })
  .then(() => {
    if (process.env.GITHUB_TOKEN) return releaseToGithub();
  })
  .then(() => console.log('Done'))
  .catch(err => {
    console.log(err.stack || err);
    process.exit(1);
  });
