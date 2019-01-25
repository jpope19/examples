var https = require('https');
var debug = require('debug')('bult:TwitterApiHelper');
var crypto = require('crypto');
var OAuth = require('oauth-1.0a');
var HttpsUtils = require('./HttpsUtils');

var oauth = OAuth({
  consumer: {
    key: process.env.TWITTER_CONSUMER_KEY,
    secret: process.env.TWITTER_CONSUMER_SECRET
  },
  signature_method: 'HMAC-SHA1',
  hash_function: hash_function_sha1
});
var bearer_token;

// parses query string response
function parseResponse(response) {
  let params = response.split('&'), obj = {};
  for (let i = 0; i < params.length; i++) {
    let keyValPair = params[i].split('=');
    if (!!keyValPair && keyValPair.length == 2) {
      obj[keyValPair[0]] = keyValPair[1];
    }
  }
  return obj;
}

function hash_function_sha1(base_string, key) {
  return crypto.createHmac('sha1', key).update(base_string).digest('base64');
}

let hostname = 'api.twitter.com';
function makeOAuthRequest(path, method, data, token) {
  return new Promise((resolve, reject) => {
    let request_data = { url: `https://${hostname}${path}`, method, data };

    debug(`making ${method} request to Twitter: ${path}`);
    let request = https.request({
      hostname,
      path,
      method,
      headers: oauth.toHeader(oauth.authorize(request_data, token))
    }, res => {
      let status = res.statusCode;

      res.setEncoding('utf8');
      let rawData = '';
      res.on('data', (chunk) => { rawData += chunk; });
      res.on('end', () => {
        if (status == 200 || status == 204) {
          resolve(rawData);
        } else {
          debug(path);
          debug(rawData);
          let err = new Error(`Received non-200 Status Code: ${status}`);
          err.statusCode = status;
          reject(err);
        }
      });

    });

    request.on('error', e => {
      debug(`Failed to authenticate user.`);
      reject(e);
    });

    request.end();
  });
}

function makeBasicAuthRequest(path, method, body) {
  return new Promise((resolve, reject) => {
    var options = {
      hostname,
      path,
      method,
      // authentication headers
      headers: {
         'Authorization': `Basic ${Buffer.from(`${process.env.TWITTER_CONSUMER_KEY}:${process.env.TWITTER_CONSUMER_SECRET}`).toString('base64')}`,
         'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
      }
    };
    //this is the call
    request = https.request(options, res => {
      let status = res.statusCode;
  
      res.setEncoding('utf8');
      let rawData = '';
      res.on('data', (chunk) => { rawData += chunk; });
      res.on('end', () => {
        if (status == 200 || status == 204) {
          resolve(rawData);
        } else {
          debug(path);
          debug(rawData);
          let err = new Error(`Received non-200 Status Code: ${status}`);
          err.statusCode = status;
          reject(err);
        }
      });
    });
  
    request.on('error', e => {
      debug(`Failed to authenticate user.`);
      reject(e);
    });
  
    request.end( body || "");
  });
};

function makeBearerRequest(path, method, body) {
  return new Promise((resolve, reject) => {
    var options = {
      hostname,
      path,
      method,
      // authentication headers
      headers: {
         'Authorization': `Bearer ${bearer_token}`
      }
    };
    //this is the call
    request = https.request(options, res => {
      let status = res.statusCode;
  
      res.setEncoding('utf8');
      let rawData = '';
      res.on('data', (chunk) => { rawData += chunk; });
      res.on('end', () => {
        if (status == 200 || status == 204) {
          resolve(rawData);
        } else {
          debug(path);
          debug(rawData);
          let err = new Error(`Received non-200 Status Code: ${status}`);
          err.statusCode = status;
          reject(err);
        }
      });
    });
  
    request.on('error', e => {
      debug(`Failed to authenticate user.`);
      reject(e);
    });
  
    request.end( body || "");
  });
};
// get bearer token
makeBasicAuthRequest('/oauth2/token', 'POST', 'grant_type=client_credentials').then( data => {
  debug("------ BEARER TOKEN ------");
  let obj = JSON.parse(data);
  if (obj.token_type == "bearer" && !!obj.access_token) {
    debug(obj.access_token);
    bearer_token = obj.access_token;
  }
}).catch( e => {
  debug("------ BEARER TOKEN ------");
  debug(" ERROR ");
  debug(e);
});

function TwitterApiHelper() {};
TwitterApiHelper.authenticate = function() {
  return makeOAuthRequest('/oauth/request_token', 'POST', { oauth_callback: process.env.TWITTER_AUTH_CALLBACK }).then( response => {
    let params = response.match(/oauth_token=([^&]*)&oauth_token_secret=([^&]*)&oauth_callback_confirmed=([^&]*)/);
    if (!!params && params.length == 4) {
      let oauth_token = params[1], oauth_token_secret = params[2], oauth_callback_confirmed = params[3] == "true";
      if (!oauth_callback_confirmed) {
        throw new Error('OAuth Callback not confirmed.');
      } else {
        return `https://${hostname}/oauth/authenticate?oauth_token=${oauth_token}`;
      }
    }
  });
};

TwitterApiHelper.createWebhook = function() {
  return makeOAuthRequest(`/1.1/account_activity/all/prod/webhooks.json?url=${encodeURIComponent(process.env.TWITTER_SUB_CALLBACK)}`, 'POST', null, {key: process.env.TWITTER_ACCESS_TOKEN, secret: process.env.TWITTER_ACCESS_TOKEN_SECRET}).then( response => {
    return parseResponse(response);
  });
};

TwitterApiHelper.getWebhooks = function() {
  return makeOAuthRequest('/1.1/account_activity/all/webhooks.json', 'GET').then( response => {
    return JSON.parse(response);
  });
};

TwitterApiHelper.getSubscriptions = function() {
  return makeOAuthRequest('/1.1/account_activity/all/prod/subscriptions/list.json', 'GET').then( response => {
    return JSON.parse(response);
  });
};

TwitterApiHelper.createSubscription = function(accessToken, accessTokenSecret) {
  // check to see if subscription already exists, if not, create one
  return makeOAuthRequest('/1.1/account_activity/all/prod/subscriptions.json', 'GET', null, {key: accessToken, secret: accessTokenSecret}).then( response => {
    return parseResponse(response);
  }).catch( () => {
    return makeOAuthRequest('/1.1/account_activity/all/prod/subscriptions.json', 'POST', null, {key: accessToken, secret: accessTokenSecret}).then( response => {
      return parseResponse(response);
    });
  });
};

TwitterApiHelper.secureWebhook = function(crc_token) {
  return new Promise((resolve, reject) => {
    const hmac = crypto.createHmac('sha256', process.env.TWITTER_CONSUMER_SECRET);

    hmac.on('readable', () => {
      const data = hmac.read();
      if (data) {
        resolve(data.toString('base64'));
      }
    });

    hmac.write(crc_token);
    hmac.end();
  });
};

TwitterApiHelper.getAccessToken = function(oauth_token, oauth_verifier) {
  return makeOAuthRequest('/oauth/access_token', 'POST', { oauth_verifier }, {key: oauth_token}).then( response => {
    return parseResponse(response);
  });
};

TwitterApiHelper.deletePost = function(postId, accessToken, accessTokenSecret) {
  return makeOAuthRequest(`/1.1/statuses/destroy/${postId}.json`, 'POST', null, {key: accessToken, secret: accessTokenSecret}).then( response => {
    return JSON.parse(response);
  });
};

TwitterApiHelper.unretweet = function(postId, accessToken, accessTokenSecret) {
  return makeOAuthRequest(`/1.1/statuses/unretweet/${postId}.json`, 'POST', null, {key: accessToken, secret: accessTokenSecret}).then( response => {
    return JSON.parse(response);
  });
};

TwitterApiHelper.unfavorite = function(postId, accessToken, accessTokenSecret) {
  return makeOAuthRequest(`/1.1/favorites/destroy.json?id=${postId}`, 'POST', null, {key: accessToken, secret: accessTokenSecret}).then( response => {
    return JSON.parse(response);
  });
};

// traverse a timeline
TwitterApiHelper.getTimeline = function(data, accessToken, accessTokenSecret) {
  let url = `/1.1/statuses/user_timeline.json?trim_user=true&user_id=${data.user_id}&tweet_mode=extended`;
  if (!!data.sinceId) {
    url += `&since_id=${data.sinceId}`;
  } else if (!!data.maxId) {
    url += `&max_id=${data.maxId}`;
  }
  if (!!data.count) {
    url += `&count=${data.count}`;
  }
  return makeOAuthRequest(url, 'GET', null, {key: accessToken, secret: accessTokenSecret}).then( response => {
    return JSON.parse(response);
  });
};

TwitterApiHelper.getTimelineArchive = function(data) {
  let url = `/1.1/tweets/search/fullarchive/prod.json`;
  let params = {
    maxResults: 100,
    fromDate: '200603210000'
  };
  if (!!data.twitAccountId) {
    params.query = `from:${data.twitAccountId}`;
  }
  if (!!data.next) {
    params.next = data.next;
  }
  return makeBearerRequest(url, 'POST', JSON.stringify(params)).then( response => {
    return JSON.parse(response);
  });
};

TwitterApiHelper.getTweet = function(data, accessToken, accessTokenSecret) {
  let url = `/1.1/statuses/show.json?trim_user=1&id=${data.smPostId}`;
  return makeOAuthRequest(url, 'GET', null, {key: accessToken, secret: accessTokenSecret}).then( response => {
    return JSON.parse(response);
  });
};

TwitterApiHelper.getTweets = function(data, accessToken, accessTokenSecret) {
  let url = `/1.1/statuses/lookup.json?trim_user=1&id=${data.ids.join(',')}`;
  return makeOAuthRequest(url, 'GET', null, {key: accessToken, secret: accessTokenSecret}).then( response => {
    return JSON.parse(response);
  });
};

TwitterApiHelper.getVerifiedUser = function(accessToken, accessTokenSecret) {
  return makeOAuthRequest('/1.1/account/verify_credentials.json?include_email=true', 'GET', null, {key: accessToken, secret: accessTokenSecret}).then( response => {
    return JSON.parse(response);
  });
};

TwitterApiHelper.typeahead = function(query, accessToken, accessTokenSecret) {
  if (!!accessToken && !!accessTokenSecret) {
    return makeOAuthRequest(`/1.1/users/search.json?q=${query}`, 'GET', null, {key: accessToken, secret: accessTokenSecret}).then( response => {
      return JSON.parse(response);
    }).catch( err => {
      debug(err);
      throw err;
    });
  } else {
    return HttpsUtils.createGetRequest(`https://typeahead-js-twitter-api-proxy.herokuapp.com/demo/search?q=${query}`).then( json => {
      return json;
    }).catch( err => {
      debug(err);
      throw err;
    });
  }
}

module.exports = TwitterApiHelper;
