const express = require('express');
const app = express();
const fileUpload = require('express-fileupload');
const port = process.env.PORT || 5000;
const path = require('path');
const fs = require('fs');

const videoGenerator = require('./videoGenerator');

app.use(fileUpload());
app.set('view engine', 'pug');
app.use(express.static('public'));
app.post('/upload', (req, res) => {
  if (!req.files) {
    return res.status(400).send('No files were uploaded.');
  }

  let brainWaveData = req.files.brainWaveData;
  brainWaveData.mv(path.join(__dirname, 'brain_data', Date.now() + '.csv'), (err) => {
    if (err)
      return res.status(500).send(err);
    const videoSpecs = videoGenerator.parse();
    videoGenerator.generateVideo(videoSpecs)
      .then(() => {
        console.log('then');
        res.redirect('/video');
      })
      .catch((e) => {
        console.log('*******************');
        console.log(e);
      });
  });
});

function getLatestFileFromFolder(dir, fileExtension) {
  const sorted = fs.readdirSync(dir)
    .filter(file => file.includes(`.${fileExtension}`))
    .sort();
  return sorted[sorted.length - 1];
}

app.use('/video', (req, res) => {
  const videoFile = getLatestFileFromFolder(path.join(__dirname, 'public'), 'mp4');
  res.render('video', { videoSrc: `/${videoFile}` });
});

app.use('/graph-video', (req, res) => {
  const videoFile = 'background/sample_wave.mp4';
  res.render('video', { videoSrc: `/${videoFile}` });
});
app.listen(port, () => console.log(`app listening on port ${port}!`))