Vue.component('bult-tweet', {
  template: 'utils/bult-tweet.html',
  props: ['post', 'user'],
  data: function() {
    return {
      photos: [],
      video: [],
      link: ""
    }
  },
  methods: {
    accountHandle: function() {
      if (!!this.post.twitterId) {
        return this.user.twitAccountHandle;
      } else if (!!this.post.instagramId) {
        return this.user.instaAccountHandle;
      }
    },
    platformType: function() {
      if (!!this.post.twitterId) {
        return "/images/Twitter_Logo_Blue.png";
      } else if (!!this.post.instagramId) {
        return "/images/IG_Glyph_Fill.png";
      }
    },
    profilePicture: function() {
      if (!!this.post.twitterId) {
        // TODO default profile pic?
        return this.user.twitProfilePhoto.replace('_normal', '');
      } else if (!!this.post.instagramId) {
        return this.user.instaProfilePhoto;
      }
    },
    formatDate: function(date) {
      return moment(date).format('MMMM Do YYYY, h:mm:ss a');
    },
    linkText: function() {
      if (!!this.post.twitterId) {
        return "View on Twitter";
      } else if (!!this.post.instagramId) {
        return "View on Instagram";
      }
    }
  },
  created: function() {
    if (!!this.post && !!this.post.Media) {
      for (let i = 0; i < this.post.Media.length; i++) {
        if (this.post.Media[i].mediaType == "photo") {
          this.photos.push(this.post.Media[i]);
        } else if (this.post.Media[i].mediaType == "video") {
          this.video.push(this.post.Media[i]);
        } else if (this.post.Media[i].mediaType == "animated_gif") {
          // TODO add html for animated gif to make video loop
          this.video.push(this.post.Media[i]);
        }
      }
    }
    if (!!this.post.twitterId) {
      this.link = !!this.post.link ? this.post.link : `https://twitter.com/${this.user.twitAccountHandle}/status/${this.post.twitterId}`;
    }
  }
});
