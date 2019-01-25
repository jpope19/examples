var debug = require('debug')('bult:TwitterController');
var userController = require('./user');
var TwitterApiHelper = require('./../helpers/TwitterApiHelper');
var TwitterBultConverter = require('./../helpers/TwitterBultConverter');
var converter = new TwitterBultConverter();
var models = require('./../models');

function Twitter() {
  this.createWebhook = function() {
    return TwitterApiHelper.createWebhook();
  }

  this.authenticateTwitterAccount = function(data) {
    let {oauth_token, oauth_verifier} = data;
    return TwitterApiHelper.getAccessToken(oauth_token, oauth_verifier).then( token => {
      let accessToken = token.oauth_token, accessTokenSecret = token.oauth_token_secret;
      return TwitterApiHelper.getVerifiedUser(accessToken, accessTokenSecret).then( account => {
        debug(account);        
        let user = converter.twitterUserToBultUser(account);
        user.twitAccessToken = accessToken;
        user.twitAccessTokenSecret = accessTokenSecret;
        debug(user);
        return userController.createOrUpdateTwitterUser(user).then( bultUser => {
          debug('got here');
          return TwitterApiHelper.createSubscription(accessToken, accessTokenSecret).then( () => {
            debug('added subscription');
            return bultUser;
          });
        });
      });
    });
  };

  this.initiateTwitterAuthentication = function() {
    return TwitterApiHelper.authenticate();
  };

  this.secureWebhook = function(crc_token) {
    return TwitterApiHelper.secureWebhook(crc_token);
  };

  this.createAppWebhook = function() {
    return TwitterApiHelper.createWebhook();
  };

  this.getAppWebhooks = function() {
    return TwitterApiHelper.getWebhooks();
  };

  this.getAppSubscriptions = function() {
    return TwitterApiHelper.getSubscriptions();
  };

  this.handleWebhookEvent = function(evt) {
    return new Promise((resolve, reject) => {
      let twitAccountId = evt.for_user_id;
      if (!twitAccountId) reject(new Error('Twitter Event did not provide for_user_id'));
  
      return models.sequelize.transaction( () => {
        return userController.getByTwitterId(twitAccountId).then( user => {
          if (!!user) {
            let promises = [];
            if (!!evt.tweet_create_events) {
              for (let i = 0; i < evt.tweet_create_events.length; i++) {
                let tweet = evt.tweet_create_events[i];
                // if our user posted this
                if (!!tweet.user && twitAccountId == tweet.user.id_str) {
                  promises.push(this.createAllPostsInTweet(tweet));
                } else if (!!tweet.retweeted_status && !!tweet.retweeted_status.user && tweet.retweeted_status.user.id_str) {
                  // if a retweet, update post counts
                  promises.push(this.updatePostStats(tweet.retweeted_status));
                }
                // get rid of else - user could be replying to his own status
                if (twitAccountId == tweet.in_reply_to_user_id_str) {
                  // if a reply, add 1 to the post's replies count
                  promises.push(models.getModels().Post.findOne({ where: { twitterId: tweet.in_reply_to_status_id_str }}).then( bultPost => {
                    if (!!bultPost) {
                      bultPost.replies += 1;
                      return models.getModels().ScoreLog.create({ postId: bultPost.id, replies: bultPost.replies, userId: user.id }).then( () => {
                        return bultPost.save();
                      });
                    } else {
                      return false;
                    }
                  }));
                }
              }
            }
            if (!!evt.favorite_events) {
              // update post to update favorites count
              for (let i = 0; i < evt.favorite_events.length; i++) {
                if (twitAccountId == evt.favorite_events[i].favorited_status.user.id_str)
                  promises.push(this.updatePostStats(evt.favorite_events[i].favorited_status));
              }
            }
            if (!!evt.follow_events) {
              // update user to update followers
              for (let i = 0; i < evt.follow_events.length; i++) {
                let target = evt.follow_events[i].target, source = evt.follow_events[i].source;
                promises.push(userController.createOrUpdateTwitterUser(converter.twitterUserToBultUser(target)));
                promises.push(userController.createOrUpdateTwitterUser(converter.twitterUserToBultUser(source)));
              }
            }
            if (!!evt.tweet_delete_events) {
              // should we keep these to train models in the future?
              for (let i = 0; i < evt.tweet_delete_events.length; i++) {
                if (!!evt.tweet_delete_events[i].status && !!evt.tweet_delete_events[i].status.id)
                  promises.push(models.getModels().Post.destroy({ where: { twitterId: evt.tweet_delete_events[i].status.id }}));
              }
            }
            return Promise.all(promises);
          } else {
            reject(new Error(`User for twitterId: ${evt.for_user_id} does not exist.`));
          }
        });
      }).then( resolve )
      .catch( reject );
    });
  };

  this.updatePostStats = function(tweet) {
    return models.getModels().Post.findOne({ where: { twitterId: tweet.id_str }}).then( bultPost => {
      if (!!bultPost) {
        bultPost.shares = tweet.retweet_count || 0;
        bultPost.quoted = tweet.quote_count || 0;
        bultPost.favorites = tweet.favorite_count || 0;
        bultPost.replies = tweet.reply_count || 0;

        let log = converter.createScoreLog(tweet);
        log.postId = bultPost.id;
        log.userId = bultPost.userId;
        
        return models.getModels().ScoreLog.create(log).then( () => {
          return bultPost.save();
        });

      } else {
        return false;
      }
    });
  };

  // recursive solution for tweets that are replies, quotes, etc
  this.createAllPostsInTweet = function(tweet) {
    // base case
    if (!tweet.retweeted_status && !tweet.quoted_status) {
      // TODO check quoted_status_id_str or retweeted_status_id_str if these fields are empty
      // Query the API for these tweets, and insert those
      return this.createTwitterPost(tweet);
    } else if (!!tweet.retweeted_status) {
      return this.createAllPostsInTweet(tweet.retweeted_status).then( retweetedStatus => {
        return this.createTwitterPost(tweet).then( currentTweet => {
          currentTweet.retweetId = retweetedStatus.id;
          return currentTweet.save();
        });
      });
    } else if (!!tweet.quoted_status) {
      return this.createAllPostsInTweet(tweet.quoted_status).then( quotedStatus => {
        return this.createTwitterPost(tweet).then( currentTweet => {
          currentTweet.quoteId = quotedStatus.id;
          return currentTweet.save();
        });
      });
    }
  };

  this.createTwitterPost = function(tweet, bultUser) {
    let promises = Promise.resolve();
    if (!bultUser) {
      promises = promises.then( () => {
        return userController.createOrUpdateTwitterUser(converter.twitterUserToBultUser(tweet.user)).then( user => {
          bultUser = user;
          return bultUser;
        });
      });
    }

    return promises.then( () => {
      let post = converter.tweetToBultPost(tweet);
      post.userId = bultUser.id;
      return models.getModels().Post.findOne({ where: { twitterId: post.twitterId }}).then( bultPost => {
        if (!bultPost) {
          return models.getModels().Post.create(post).then( bultPost => {
            let promises = [];

            // create log
            let log = converter.createScoreLog(tweet);
            log.postId = bultPost.id;
            log.userId = bultUser.id;
            promises.push(models.getModels().ScoreLog.create(log));

            // add hashtags
            if (!!tweet.entities && !!tweet.entities.hashtags && tweet.entities.hashtags.length > 0) {
              let hashtags = [];
              for (let i = 0; i < tweet.entities.hashtags.length; i++) {
                hashtags.push({ text: tweet.entities.hashtags[i].text, postId: bultPost.id, userId: bultUser.id });
              }
              promises.push(models.getModels().Hashtag.bulkCreate(hashtags));
            }
      
            // add media
            if (!!tweet.extended_entities && !!tweet.extended_entities.media && tweet.extended_entities.media.length > 0) {
              let media = converter.twitterMediaToBultMedia(tweet.extended_entities.media);
              for (let i = 0; i < media.length; i++) {
                media[i].postId = bultPost.id;
                media[i].userId = bultUser.id;
              }
              promises.push(models.getModels().Media.bulkCreate(media));
            }
      
            return Promise.all(promises);
          }).then( () => {
            return models.getModels().Post.findOne({ where: { twitterId: post.twitterId }});
          });
        } else return bultPost;
      });
    });
  };

  // for initial scan
  this.bulkCreateTweetsFromScan = function(tweets, bultUser) {
    if (!!bultUser && !!bultUser.twitScanCompletionDate) {
      debug('Scipping scan, already run');
      return Promise.resolve();
    } else {
    let self = this;
      return models.sequelize.transaction( () => {
        let promises = Promise.resolve();
        // tweets need to be in order from oldest to newest for this to work
        for (let tweet of tweets) {
          promises = promises.then(() => {
            return self.createTwitterPost(tweet, bultUser);
          }).then( bultPost => {
            let relationships = [];
            if (bultPost.twitterReplyId && !bultPost.repliedToId) {
              relationships.push(models.getModels().Post.findOne({ where: { twitterId: bultPost.twitterReplyId }}).then( replyPost => {
                if (!!replyPost) {
                  bultPost.repliedToId = replyPost.id;
                  return bultPost.save();
                } else return bultPost;
              }));
            }
            if (bultPost.twitterQuoteId && !bultPost.quoteId) {
              relationships.push(models.getModels().Post.findOne({ where: { twitterId: bultPost.twitterQuoteId }}).then( quotePost => {
                if (!!quotePost) {
                  bultPost.quoteId = quotePost.id;
                  return bultPost.save();
                } else return bultPost;
              }));
            }
            return Promise.all(relationships);
          });
        }
        promises = promises.then(() => {
          bultUser.twitScanCompletionDate = new Date();
          return userController.createOrUpdateTwitterUser(bultUser);
        });
        
        return promises;
      });      
    }
  };
};

module.exports = new Twitter();
