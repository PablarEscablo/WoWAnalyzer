import Express from 'express';
import Sequelize from 'sequelize';
import querystring from 'querystring';
import Raven from 'raven';

import models from 'models';
import fetchFromWarcraftLogsApi, { WCL_REPORT_DOES_NOT_EXIST_HTTP_CODE } from 'helpers/fetchFromWarcraftLogsApi';
import WarcraftLogsApiError from 'helpers/WarcraftLogsApiError';

const WclApiResponse = models.WclApiResponse;

function serializeUrl(path, query) {
  return `/${path}?${querystring.stringify(query)}`;
}
async function cacheWclApiResponse(cacheKey, response, responseTime) {
  const cachedWclApiResponse = await WclApiResponse.findById(cacheKey);
  if (cachedWclApiResponse) {
    await cachedWclApiResponse.update({
      content: response,
      wclResponseTime: responseTime,
      numAccesses: cachedWclApiResponse.numAccesses + 1,
      lastAccessedAt: Sequelize.fn('NOW'),
    });
  } else {
    await WclApiResponse.create({
      url: cacheKey,
      content: response,
      wclResponseTime: responseTime,
    });
  }
}

const router = Express.Router();
router.get('/*', async (req, res) => {
  const resolve = jsonString => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.send(jsonString);
  };
  const reject = (statusCode, jsonString) => {
    res.status(statusCode);
    resolve(jsonString);
  };

  try {
    // remove / prefix
    const path = req.path.substr(1);
    // Don't use `req.params[0]` here as this automatically (url)decodes parts, breaking special characters in name!
    const query = req.query;
    // This allows users to skip the cache and refresh always. This is useful when live logging. It stores the result in the regular (uncachebusted) spot so that future requests for the regular request are also updated.
    let skipCache = false;
    if (query._) {
      skipCache = true;
      delete query._;
    }

    const cacheKey = serializeUrl(path, query);
    if (!skipCache) {
      const cachedWclApiResponse = await WclApiResponse.findById(cacheKey);
      if (cachedWclApiResponse) {
        console.log('cache HIT', cacheKey);
        // noinspection JSIgnoredPromiseFromCall No need to wait for this as it doesn't affect the result.
        cachedWclApiResponse.update({
          numAccesses: cachedWclApiResponse.numAccesses + 1,
          lastAccessedAt: Sequelize.fn('NOW'),
        });
        resolve(cachedWclApiResponse.content);
        return;
      } else {
        console.log('cache MISS', cacheKey);
      }
    } else {
      console.log('cache SKIP', cacheKey);
    }

    const wclStart = Date.now();
    const wclResponse = await fetchFromWarcraftLogsApi(path, query);
    const wclResponseTime = Date.now() - wclStart;
    console.log('wcl response time:', wclResponseTime, 'ms');
    // noinspection JSIgnoredPromiseFromCall No need to wait for this as it doesn't affect the result.
    cacheWclApiResponse(cacheKey, wclResponse, wclResponseTime);
    resolve(wclResponse);
  } catch (err) {
    if (err instanceof WarcraftLogsApiError) {
      // An error on WCL's side
      console.error(`WCL Error (${err.statusCode}): ${err.message}`);
      if (err.statusCode !== WCL_REPORT_DOES_NOT_EXIST_HTTP_CODE) {
        // Ignore "This report does not exist or is private."
        Raven.installed && Raven.captureException(err, {
          extra: err.context,
        });
      }
      reject(err.statusCode, {
        error: 'Warcraft Logs API error',
        message: err.message,
      });
    } else {
      // An error on our side
      console.error('A server error occured', err);
      reject(500, {
        error: 'A server error occured',
        message: err.message,
      });
    }
  }
});

export default router;
