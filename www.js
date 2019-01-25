#!/usr/bin/env node

/**
 * Module dependencies.
 */

require('dotenv').config();
const cluster = require('cluster');
const { fork } = require('child_process');

var debug = require('debug')('framework:server');
var models = require('../models');
var prepopulate = process.env.PREPOPULATE == 'true';
var PRODUCTION = 'production';
var env = (process.env.NODE_ENV && process.env.NODE_ENV.trim()) || 'development';
var path = require('path');
var KetchrMessage = require('./../lib/KetchrMessage');

if (cluster.isMaster) {

  let WORKERS = process.env.WEB_CONCURRENCY || 1;
  // using 1 worker for the twitter polling
  let WEB_WORKERS = Math.max(WORKERS-5, 1);
  for (let i = 0; i < WEB_WORKERS; i++) {
    cluster.fork();
  }

  if (env == PRODUCTION) {
    let twitterPoller = fork(path.join(__dirname, '..', 'services', 'TwitterTweetPollerService.js'));
    let twitterRetweetPoller = fork(path.join(__dirname, '..', 'services', 'TwitterRetweetPollerService.js'));
    let notificationService = fork(path.join(__dirname, '..', 'services', 'NotificationService.js'));
    let gameService = fork(path.join(__dirname, '..', 'services', 'GameService.js'));

    function sendMessageToWorkers(msg) {
      for (const id in cluster.workers) {
        cluster.workers[id].send(msg);
      }
    }

    function pollAccount(msg) {
      if (msg.data.type == models.enums.accountType.TWITTER) {
        twitterPoller.send(msg);
      }
    }

    function stopPollAccount(msg) {
      if (msg.data.type == models.enums.accountType.TWITTER) {
        twitterPoller.send(msg);
      }
    }

    function sendInitialTweets(msg) {
      twitterPoller.send(msg);
    }

    function pollPost(msg) {
      twitterRetweetPoller.send(msg);
    }

    function stopPollPost(msg) {
      twitterRetweetPoller.send(msg);
    }

    function sendDeviceNotification(msg) {
      notificationService.send(msg);
    }

    function createTweet(msg) {
      gameService.send(msg);
    }

    function updateTweet(msg) {
      gameService.send(msg);
    }

    function deleteTweet(msg) {
      gameService.send(msg);
    }

    for (const id in cluster.workers) {
      cluster.workers[id].on('message', (msg) => {
        switch(msg.type) {
          case KetchrMessage.types.POLL_ACCOUNT:
            pollAccount(msg);
            break;
          case KetchrMessage.types.STOP_POLL_ACCOUNT:
            stopPollAccount(msg);
            break;
          case KetchrMessage.types.WEB_NOTIFICATION:
            sendMessageToWorkers(msg);
            break;
          case KetchrMessage.types.DEVICE_NOTIFICATION:
            sendDeviceNotification(msg);
            break;
        }
      });
    }
    twitterPoller.on('message', msg => {
      switch(msg.type) {
        case KetchrMessage.types.CREATE_TWEET:
          createTweet(msg);
          break;
      }
    });
    twitterRetweetPoller.on('message', msg => {
      switch(msg.type) {
        case KetchrMessage.types.UPDATE_TWEET:
          updateTweet(msg);
          break;
        case KetchrMessage.types.TWEET_DELETED:
          deleteTweet(msg);
          break;
      }
    });
    gameService.on('message', msg => {
      switch(msg.type) {
        case KetchrMessage.types.WEB_NOTIFICATION:
          sendMessageToWorkers(msg);
          break;
        case KetchrMessage.types.DEVICE_NOTIFICATION:
          sendDeviceNotification(msg);
          break;
        case KetchrMessage.types.POLL_RETWEET:
          pollPost(msg);
          break;
        case KetchrMessage.types.POLL_ACCOUNT:
          pollAccount(msg);
          break;
        case KetchrMessage.types.POLL_ACCOUNT_LATEST_TWEET:
          sendInitialTweets(msg);
          break;
        case KetchrMessage.types.STOP_POLL_RETWEET:
          stopPollPost(msg);
          break;
      }
    });
  }

  // no reason to sync and prepopulate more than once -- so do it in the master
  models.init()
    .then(() => {
      return models.sequelize.sync();
    })
    .then(() => {
      if (prepopulate) return models.prepopulate();
      else return;
    });

} else {

  require('./../services/WebService');

}
