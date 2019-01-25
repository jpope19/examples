var debug = require('debug')('bult:InstagramApiHelper');
var randomstring = require('randomstring');
var HttpsUtils = require('./HttpsUtils');

// OAuthAccessTokenException - need to redo authentication

var config = {
  clientId: process.env.INSTAGRAM_CLIENT_ID,
  clientSecret: process.env.INSTAGRAM_CLIENT_SECRET,
  apiHost: 'api.instagram.com',
  accessTokenUri: '/oauth/access_token',
  authorizationUri: '/oauth/authorize/',
  redirectUri: process.env.INSTAGRAM_AUTH_CALLBACK,
  subscriptionCallback: process.env.INSTAGRAM_SUB_CALLBACK
};

var httpsUtils = new HttpsUtils(config.apiHost);

function InstagramApiHelper() {};
InstagramApiHelper.authenticate = function() {
  return new Promise((resolve, reject) => {
    resolve(`https://${config.apiHost}${config.authorizationUri}?client_id=${config.clientId}&redirect_uri=${encodeURIComponent(config.redirectUri)}&response_type=code`);
  });
};

InstagramApiHelper.getAccessToken = function(code, error) {
  return new Promise((resolve, reject) => {
    if (!!code) {
      const data = {
        client_id: config.clientId,
        client_secret: config.clientSecret,
        grant_type: 'authorization_code',
        redirect_uri: config.redirectUri,
        code
      };
      httpsUtils.createPostRequest(config.accessTokenUri, data).then( response => {
        resolve(response);
      });
    } else {
      debug('======= InstagramApiHelper Error Authenticating =======');
      debug(error);
      reject(new Error(`Error: ${error.name}`));
    }
  });
};

InstagramApiHelper.createSubscription = function() {
  return new Promise((resolve, reject) => {
    const data = {
      client_id: config.clientId,
      client_secret: config.clientSecret,
      object: 'user',
      aspect: 'media',
      verify_token: randomstring.generate(7),
      callback_url: config.subscriptionCallback
    };
    httpsUtils.createPostRequest('/v1/subscriptions/', data).then( response => {
      resolve(response);
    });
  });
};

InstagramApiHelper.getMedia = function(data) {
  return new Promise((resolve, reject) => {
    let mediaId = data.mediaId, accessToken = data.accessToken;
    HttpsUtils.createGetRequest(`https://${config.apiHost}/v1/media/${mediaId}?access_token=${accessToken}`).then( response => {
      resolve(response);
    }).catch(reject);
  });
};

InstagramApiHelper.deleteMedia = function(data) {
  return new Promise((resolve, reject) => {
    let mediaId = data.mediaId, accessToken = data.accessToken;
    httpsUtils.createDeleteRequest(`/v1/media/${mediaId}?access_token=${accessToken}`).then( response => {
      debug(`createDeleteRequest response: ${response}`);
      resolve(response);
    }).catch(reject);
  });
};

InstagramApiHelper.oembed = function(data) {
  return new Promise((resolve, reject) => {
    debug('==== starting oembed request ====');
    debug(data);
    HttpsUtils.createGetRequest(`https://${config.apiHost}/oembed?url=${data.postShortUrl}&omitscript=true`).then( response => {
      resolve(response);
    }).catch(reject);
  });
};

InstagramApiHelper.typeahead = function(q, accessToken) {
  return new Promise((resolve, reject) => {
    HttpsUtils.createGetRequest(`https://${config.apiHost}/v1/users/search?q=${q}&access_token=${accessToken}`).then( response => {
      resolve(response);
    }).catch(reject);
  });
};

module.exports = InstagramApiHelper;
