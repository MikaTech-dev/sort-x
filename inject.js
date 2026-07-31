/**
 * inject.js — Runs in the MAIN world (page context).
 * Intercepts X's fetch and XHR responses for followers/following lists.
 * Extracts profile totals (followers_count / friends_count) and list users,
 * then posts to content.js via window.postMessage.
 */
(function () {
  'use strict';

  if (window.__sortx_injected) return;
  window.__sortx_injected = true;

  function findInstructions(obj, depth) {
    if (!obj || typeof obj !== 'object' || (depth || 0) > 10) return [];
    if (Array.isArray(obj.instructions)) return obj.instructions;
    for (const key of Object.keys(obj)) {
      if (obj[key] && typeof obj[key] === 'object') {
        const res = findInstructions(obj[key], (depth || 0) + 1);
        if (res.length > 0) return res;
      }
    }
    return [];
  }

  function findProfileTotals(obj, depth) {
    let followers = null;
    let following = null;
    if (!obj || typeof obj !== 'object' || (depth || 0) > 10) return { followers, following };

    if (typeof obj.followers_count === 'number') followers = obj.followers_count;
    if (typeof obj.friends_count === 'number') following = obj.friends_count;

    if (obj.relationship_counts) {
      if (typeof obj.relationship_counts.followers === 'number') followers = obj.relationship_counts.followers;
      if (typeof obj.relationship_counts.following === 'number') following = obj.relationship_counts.following;
    }

    if (followers != null && following != null) return { followers, following };

    for (const key of Object.keys(obj)) {
      if (obj[key] && typeof obj[key] === 'object') {
        const res = findProfileTotals(obj[key], (depth || 0) + 1);
        if (followers == null && res.followers != null) followers = res.followers;
        if (following == null && res.following != null) following = res.following;
        if (followers != null && following != null) break;
      }
    }
    return { followers, following };
  }

  function extractDataFromJSON(data, url) {
    const users = [];
    let source = '';
    let totalCount = null;

    const { followers: followersTotal, following: followingTotal } = findProfileTotals(data, 0);

    try {
      const isRestAPI = url.includes('following/list.json') || url.includes('followers/list.json');
      const isFollowersGQL = /\/Followers/i.test(url) || /\/BlueVerifiedFollowers/i.test(url) || /\/UserFollowers/i.test(url);
      const isFollowingGQL = /\/Following/i.test(url) || /\/UserFollowing/i.test(url);

      if (isRestAPI) {
        source = 'rest';
        totalCount = data?.total_count || null;
        for (const u of data?.users || []) {
          users.push({
            id: u.id_str || String(u.id || ''),
            name: u.name || '',
            screenName: u.screen_name || '',
            followersCount: u.followers_count || 0,
            followingCount: u.friends_count || 0,
            avatarUrl: (u.profile_image_url_https || u.profile_image_url || '').replace('_normal.', '_200x200.'),
            bio: u.description || '',
            isVerified: Boolean(u.ext_is_blue_verified || u.verified),
            isFollowingYou: Boolean(u.followed_by),
            youFollow: Boolean(u.following),
            profileImageShape: u.ext_profile_image_shape || 'Circle',
          });
        }
      } else if (isFollowersGQL || isFollowingGQL || url.includes('/graphql/')) {
        source = isFollowersGQL ? 'followers' : isFollowingGQL ? 'following' : 'gql';

        const instructions = findInstructions(data, 0);

        for (const inst of instructions) {
          const entries = inst.entries || [];
          for (const entry of entries) {
            const itemContent = entry?.content?.itemContent || entry?.content;
            const r = itemContent?.user_results?.result || itemContent?.user_result?.result;
            if (!r) continue;

            const userObj = r.__typename === 'User' ? r : (r.user || r.result || null);
            if (!userObj) continue;

            const legacy = userObj.legacy || {};
            const core = userObj.core || {};
            const relCounts = userObj.relationship_counts || {};
            const relPersp = userObj.relationship_perspectives || {};

            const followersCount = relCounts.followers ?? legacy.followers_count ?? 0;
            const followingCount = relCounts.following ?? legacy.friends_count ?? 0;
            const screenName = core.screen_name || legacy.screen_name || '';
            const name = core.name || legacy.name || '';
            const avatarUrl = userObj.avatar?.image_url || legacy.profile_image_url_https || '';
            const bio = userObj.profile_bio?.description || legacy.description || '';

            if (screenName || name) {
              users.push({
                id: userObj.rest_id || legacy.id_str || String(userObj.id || ''),
                name: name,
                screenName: screenName,
                followersCount: Number(followersCount) || 0,
                followingCount: Number(followingCount) || 0,
                avatarUrl: avatarUrl.replace('_normal.', '_200x200.'),
                bio: bio,
                isVerified: Boolean(userObj.is_blue_verified || legacy.verified),
                isFollowingYou: Boolean(relPersp.followed_by || legacy.followed_by),
                youFollow: Boolean(relPersp.following || legacy.following),
                profileImageShape: userObj.profile_image_shape || 'Circle',
              });
            }
          }
        }
      }
    } catch (e) {
      console.error('[SortX Interceptor Error]', e);
    }

    return { users, source, totalCount, followersTotal, followingTotal };
  }

  function handleResponseData(data, url) {
    const { users, source, totalCount, followersTotal, followingTotal } = extractDataFromJSON(data, url);
    if (users.length > 0 || followersTotal != null || followingTotal != null) {
      window.postMessage(
        {
          type: '__sortx_data',
          users: users,
          source: source,
          totalCount: totalCount,
          followersTotal: followersTotal,
          followingTotal: followingTotal,
        },
        '*'
      );
    }
  }

  // Patch window.fetch
  const _fetch = window.fetch;
  window.fetch = async function (...args) {
    const response = await _fetch.apply(this, args);
    try {
      const url =
        typeof args[0] === 'string'
          ? args[0]
          : args[0] instanceof Request
            ? args[0].url
            : '';

      if (url && (url.includes('/graphql/') || url.includes('/friends/') || url.includes('/followers/') || url.includes('/following'))) {
        const clone = response.clone();
        clone.json().then(data => handleResponseData(data, url)).catch(() => {});
      }
    } catch (e) {}
    return response;
  };

  // Patch XMLHttpRequest
  const _open = XMLHttpRequest.prototype.open;
  const _send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    this._sortx_url = url;
    return _open.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function () {
    this.addEventListener('load', function () {
      try {
        const url = this._sortx_url || '';
        if (url && (url.includes('/graphql/') || url.includes('/friends/') || url.includes('/followers/') || url.includes('/following'))) {
          const data = JSON.parse(this.responseText);
          handleResponseData(data, url);
        }
      } catch (e) {}
    });
    return _send.apply(this, arguments);
  };
})();
