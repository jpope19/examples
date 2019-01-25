let TwitterApiHelper = require('./../helpers/TwitterApiHelper'),
    debug = require('debug')('skadoosh:TwitterTweetPollerService'),
    KetchrMessage = require('./../lib/KetchrMessage'),
    accounts = [],
    accountsLastPosts = {},
    pollInterval;

process.on('message', (msg) => {
  switch(msg.type) {
    case KetchrMessage.types.POLL_ACCOUNT:
      debug(`POLL_ACCOUNT`);
      let add = true;
      for (let i = 0; i < accounts.length; i++) {
        if (accounts[i].id == msg.data.id) {
          add = false;
          break;
        }
      }
      if (add) {
        accounts.push(msg.data);
        restart();
      }
      break;
    case KetchrMessage.types.STOP_POLL_ACCOUNT:
      let index = -1;
      for (let i = 0; i < accounts.length; i++) {
        if (accounts[i].id == msg.data.id) {
          index = i;
          break;
        }
      }
      if (index > -1) {
        accounts.splice(index, 1);
        restart();
      }
      break;
    case KetchrMessage.types.POLL_ACCOUNT_LATEST_TWEET:
      debug(`POLL_ACCOUNT_LATEST_TWEET`);
      debug(msg.data);
      for (let i = 0; i < msg.data.length; i++) {
        accountsLastPosts[msg.data[i].accountId] = msg.data[i];
      }
      break;
  }
});
process.on('warning', err => {
  debug(error.stack);
});

function poll() {
  if (!pollInterval) {
    pollInterval = setInterval(function() {
      for (let i = 0; i < accounts.length; i++) {
        getTimeline(accounts[i]);
      }
    }, 1000);
  }
};

function restart() {
  clearInterval(pollInterval);
  pollInterval = null;
  // wait a second so we don't exceed polling limits
  setTimeout(function() {
    poll();
  }, 1000);
};

function getTimeline(account) {
  if (!!accountsLastPosts[account.id]) {
    let lastPostId = accountsLastPosts[account.id].smPostId;
    delete accountsLastPosts[account.id];
    accountsLastPosts[account.accountHandle] = lastPostId;
  }
  let sinceId = accountsLastPosts[account.accountHandle];
  let count = !!sinceId ? null : 1;
  let accountHandle = account.accountHandle;
  TwitterApiHelper.getTimeline({sinceId, count, accountHandle}, account.accessToken, account.accessTokenSecret).then( response => {
    if (response.length > 0) {
      debug(JSON.stringify(response));
      // newest tweets are first
      for (let i = response.length-1; i >= 0; i--) {
        let tweet = response[i];
        process.send(new KetchrMessage(KetchrMessage.types.CREATE_TWEET, { account, tweet }));
        accountsLastPosts[account.accountHandle] = tweet.id_str;
      }
    }
  }).catch( err => {
    // TODO, if auth error, remove account from accountsToPoll
    debug( err );
  });
};
