var fs = require('fs-ext');
var mkdirp = require('mkdirp');
var path = require('path');

const fiddleDirPrefix = '/tmp/vclfiddle-';

function newFiddle(callback) {
  var now = new Date();

  var fiddleId = [
    now.getUTCFullYear().toString().slice(-2),
    ('0' + (now.getUTCMonth() + 1)).slice(-2),
    ('0' + now.getUTCDate()).slice(-2),
    '-',
    ('00' + (now.getUTCHours() * 60 + now.getUTCMinutes()).toString(16)).slice(-3),
    ('000' + Math.floor(Math.random() * 0x10000).toString(16)).slice(-4)
  ].join('');

  var dir = fiddleDirPrefix + fiddleId;
  var nextPath = path.join(dir, 'next');
  var runIndex = 0;
  var fiddleRunDir = path.join(dir, runIndex.toString());
  var newIndexText = (runIndex + 1).toString();

  mkdirp(fiddleRunDir, function (err) {
    if (err) {
      sails.log.debug('Could not mkdir ' + fiddleRunDir + ' because ' + err);
      return callback(new Error('Failed to access fiddle storage.'));
    }

    fs.writeFile(nextPath, newIndexText, { encoding: 'utf8' }, function (err) {
      if (err) {
        sails.log.debug('Could not write ' + nextPath + ' because ' + err);
        return callback(new Error('Failed to access fiddle storage.'));
      }
      return callback(null, {id: fiddleId, path: fiddleRunDir, runIndex: runIndex});
    })
  });

}

const fiddleIdPattern = /^\d{6}-[a-z\d]{7}$/;
const runIndexPattern = /^\d+$/;

module.exports = {

  loadViewState: function (fiddle, callback) {
    var viewStatePath = path.join(fiddle.path, 'viewstate');
    fs.readFile(viewStatePath, { encoding: 'utf8' }, function (err, data) {
      if (err) {
        sails.log.debug('Could not read ' + viewStatePath + ' because ' + err);
        return callback(new Error('Failed to access fiddle storage'));
      }
      return callback(null, JSON.parse(data));
    });
  },

  saveViewState: function (fiddle, viewState, callback) {
    var viewStatePath = path.join(fiddle.path, 'viewstate');
    fs.writeFile(viewStatePath, JSON.stringify(viewState), { encoding: 'utf8' }, function (err) {
      if (err) {
        sails.log.debug('Could not write ' + viewStatePath + ' because ' + err);
        return callback(new Error('Failed to access fiddle storage'));
      }
      return callback(null);
    });
  },

  getFiddleRun: function (fiddleId, runIndex, callback) {

    if (typeof(fiddleId) !== 'string' || typeof(runIndex) !== 'string' ||
      !fiddleId.match(fiddleIdPattern) || !runIndex.match(runIndexPattern)) {
      return callback(new Error('Invalid fiddleid or runindex'));
    }

    var fiddleRunDir = path.join(fiddleDirPrefix + fiddleId, runIndex);
    fs.stat(fiddleRunDir, function (err, stats) {
      if (err || !stats.isDirectory()) {
        // TODO log if the error isn't ENOENT
        // TODO try to pull dir from other storage
        return callback(null, null);
      }
      return callback(null,  {id: fiddleId, path: fiddleRunDir, runIndex: runIndex});
    });
  },

  prepareFiddle: function (fiddleId, callback) {

    if (typeof(fiddleId) == 'string' && fiddleId.match(fiddleIdPattern)) {
        var dir = fiddleDirPrefix + fiddleId;
        var nextPath = path.join(dir, 'next');
        fs.open(nextPath, 'r+', function(err, fd) {
          if (err) {
            // TODO log if the error isn't ENOENT
            // TODO try to pull dir from other storage
            return newFiddle(callback);
          }

          fs.flock(fd, 'ex', function (err) {
            if (err) {
              sails.log.debug('Could not acquire lock on ' + nextPath + ' because ' + err);
              return callback(new Error('Failed to access fiddle storage.'));
            }
            var buffer = new Buffer(10);
            fs.read(fd, buffer, 0, buffer.length, 0, function (err, bytesRead, buffer) {
              if (err) {
                sails.log.debug('Could not read ' + nextPath + ' because ' + err);
                return callback(new Error('Failed to access fiddle storage.'));
              }
              var runIndex = parseInt(buffer.toString('utf8', 0, bytesRead), 10);
              var newIndexText = (runIndex + 1).toString();
              buffer.write(newIndexText, 0, newIndexText.length, 'utf8');
              fs.write(fd, buffer, 0, newIndexText.length, 0, function (err, bytesWritten, buffer) {
                if (err) {
                  sails.log.debug('Could not write ' + nextPath + ' because ' + err);
                  return callback(new Error('Failed to access fiddle storage.'));
                }
                fs.close(fd, function (err) {
                  if (err) {
                    sails.log.debug('Could not close ' + nextPath + ' because ' + err);
                    return callback(new Error('Failed to access fiddle storage.'));
                  }

                  var fiddleRunDir = path.join(dir, runIndex.toString());
                  mkdirp(fiddleRunDir, function (err) {
                    if (err) {
                      sails.log.debug('Could not mkdir ' + fiddleRunDir + ' because ' + err);
                      return callback(new Error('Failed to access fiddle storage.'));
                    }
                    return callback(null, {id: fiddleId, path: fiddleRunDir, runIndex: runIndex});
                  });

                });
              });

            });
          });
        });

    } else {
      return newFiddle(callback);
    }
  }

}