"use strict";

module.exports = function(sequelize, DataTypes) {
  var User = sequelize.define("User", {
    id: {
      type: DataTypes.BIGINT,
      primaryKey: true,
      autoIncrement: true
    },
    name: DataTypes.STRING,
    email: DataTypes.STRING,
    twitName: DataTypes.STRING,
    twitEmail: DataTypes.STRING,
    twitAccessToken: DataTypes.STRING,
    twitAccessTokenSecret: DataTypes.STRING,
    twitAccountId: DataTypes.STRING,
    twitAccountHandle: {
      type: DataTypes.STRING,
      unique: true
    },
    twitProfilePhoto: DataTypes.STRING,
    twitCoverPhoto: DataTypes.STRING,
    twitDescription: DataTypes.STRING,
    twitActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    twitApprovalDate: DataTypes.DATE,
    twitLastUpdate: DataTypes.DATE,
    twitFollowers: {
      type: DataTypes.INTEGER, 
      defaultValue: 0
    },
    twitFollowing: {
      type: DataTypes.INTEGER, 
      defaultValue: 0
    },
    twitTweetCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    twitLang: DataTypes.STRING,
    twitTimeZone: DataTypes.STRING,
    twitVerified: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    twitProtected: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    twitScanCompletionDate: DataTypes.DATE,
    score: {
      type: DataTypes.FLOAT,
      defaultValue: 0.00
    }
  });

  User.associate = function(models) {
    User.hasMany(models.Alert, {foreignKey: 'userId'});
    User.hasMany(models.Device, {foreignKey: 'userId'});
    User.hasMany(models.Post, {foreignKey: 'userId'});
    User.hasMany(models.Hashtag, {foreignKey: 'userId'});
    User.hasMany(models.Media, {foreignKey: 'userId'});
    User.hasMany(models.ScoreLog, {foreignKey: 'userId'});
    User.hasMany(models.UserLog, {foreignKey: 'userId'});
    User.belongsToMany(models.Team, { foreignKey: 'userId', through: models.TeamUser });
    User.belongsToMany(models.Organization, { foreignKey: 'userId', through: models.OrgUser });
    User.hasMany(models.Subscription, { foreignKey: 'userId' });
  };

  return User;
};
