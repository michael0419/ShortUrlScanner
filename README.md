# ShortUrlScanner - Upload
My final project for Internet and Web Technologies class Fall 2020

local node.js web server desgined to take in a url to scan and return a bit.ly link to results page of the scan
this way it's easier to share scan results and information about a webpage

Features:
  - Node.js
  - Api calls to UrlScan.io, Bit.ly
  - Use of Oauth 2.0 via Bit.ly Api
  - Caching

Notes:
  - This project features caching of tokens which is not a good real world practice, it was done for a project requirement
  - Did not include credentials.json data because it contains sensitive information
