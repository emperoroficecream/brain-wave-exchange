const parse = require('csv-parse/lib/sync');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const path = require('path');


function parseFromCSVToEpisodicSpecs() {
  const file = fs.readFileSync(path.join(__dirname, 'brain_data', getLatestFileFromFolder(path.join(__dirname, 'brain_data'))));
  const records = parse(file, {
    quoting: false,
    columns: true,
    relax_column_count: true
  });
  
  
  const DELTA_WAVE_FIELD = 'Delta_TP9';
  let max;
  let min;
  records.forEach((record) => {
    let val = record[DELTA_WAVE_FIELD];
    if (val) {
      if (val > max || !max) {
        max = val;
      }
      if (val < min || !min) {
        min = val;
      }
    }
  });
  
  function getLatestFileFromFolder(dir) {
    const sorted = fs.readdirSync(dir)
      .filter(file => file.includes('.csv'))
      .sort();
    return sorted[sorted.length - 1];
  }
  
  function getLevel(val, max, min) {
    return val === max ? 9 : Math.round((val - min) / (max - min) * 100);
  }
  
  const levels = records.map((record) => {
    let result = {};
    result.TimeStamp = record.TimeStamp;
    if (record[DELTA_WAVE_FIELD]) {
      result.value = getLevel(record[DELTA_WAVE_FIELD], max, min);
    }
    return result;
  });
  
  function shuffle(a) {
    var j, x, i;
    for (i = a.length - 1; i > 0; i--) {
        j = Math.floor(Math.random() * (i + 1));
        x = a[i];
        a[i] = a[j];
        a[j] = x;
    }
    return a;
  }
  
  const videos = fs.readdirSync(__dirname + '/videos')
    .filter(dir => dir.includes('level'))
    .reduce((result, dir) => {
      const videoFiles = fs.readdirSync(__dirname + '/videos/' + dir)
      .filter(file => file.includes('.mp4'))
      .reduce((result, file) => {
        result.push({
          name: file,
          hasPlayed: false
        })
        return result;
      }, []);
      const videoFolder = {
        name: dir,
        files: videoFiles,
        isShuffled: false
      };
      result.push(videoFolder);
      return result;
    }, []);
  
  // reformatting levels so empty values are replaced with last detected level
  const episodes = levels
    .map((level, i) => {
      if (!level.value) {
        if (i === 0) {
          level.value = 0;
        } else {
          level.value = levels[i - 1].value;
        }
      }
      level.value = Math.trunc(level.value/10); // level values range from 0 to 9
      return level;
    })
    .reduce((accumulator, level, i, levels) => {
      if (i == 0 || i == levels.length - 1 || (levels[i - 1].value != level.value)) {
        accumulator.push(level);
      }
      return accumulator;
    }, [])
    .reduce((accumulator, level, i, levels) => {
      if (i !== levels.length - 1) {
        let startTime = Date.parse(level.TimeStamp);
        let endTime = Date.parse(levels[i + 1].TimeStamp);
        accumulator.push({
          length: endTime - startTime,
          level: level.value
        });
      }
      return accumulator;
    }, [])
    .map((episode) => {
      const videoFolder = videos[episode.level];
      // Shuffle first
      if (!videoFolder.isShuffled) {
        videoFolder.files = shuffle(videoFolder.files);
        videoFolder.isShuffled = true;
      }
      let nextVideo = videoFolder.files.find(file => !file.hasPlayed);
      if (!nextVideo) {
        videoFolder.files.forEach(file => file.hasPlayed = false);
        nextVideo = videoFolder.files[0];
      }
      nextVideo.hasPlayed = true;
      episode.filePath = path.join(__dirname, 'videos', videoFolder.name, nextVideo.name);
      return episode;
    });
  return episodes;
}

function trimAndConcatenate(episodes) {
  const resultPromise = new Promise((res, rej) => {
    const trimPromise = new Promise((resolve, reject) => {
      episodes.forEach((episode, i) => {
        const trimProc = ffmpeg();
        trimProc
          .input(episode.filePath)
          .duration(episode.length / 1000 + '')
          .output(path.join(__dirname, 'temp_clips', i + '-clip.mp4'))
          .on('end', () => {
            if (i === episodes.length - 1) {
              console.log('finished trimming');
              resolve();
            }
          })
          .run();
      });
    });
      
    trimPromise.then(() => {
      setTimeout(() => {
        const concatProc = ffmpeg();
        for (let i = 0; i < episodes.length; i++) {
          concatProc
            .input(path.join(__dirname, 'temp_clips', i + '-clip.mp4'))  
        }
        concatProc
          .on('end', function() {
            console.log('files have been merged successfully');
            res();
          })
          .on('error', function(err, stdout, stderr) {
            console.log('an error happened: ' + err.message, stderr);
            rej(err);
          })
          .mergeToFile(`${__dirname}/public/${Date.now()}.mp4`);
      }, 15000); // timeout is necessary for ffmpeg not to throw invalid input errors
    });
  });
  return resultPromise;
}

module.exports = {
  parse: parseFromCSVToEpisodicSpecs,
  generateVideo: trimAndConcatenate
}


