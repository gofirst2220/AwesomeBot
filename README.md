AwesomeBot [![Build Status](https://travis-ci.org/anandroiduser/AwesomeBot.svg?branch=master)](https://travis-ci.org/anandroiduser/AwesomeBot)
==========

The best Discord bot!
---------------------

*Hello, I'm AwesomeBot. I add tons of cool stuff to any Discord server, providing external content, acting as a mod, and talking to members*

That's right! AwesomeBot is an all-in-one Discord bot packed with features, written in NodeJS and using the Discord.JS third-party API. Here are some of the things he can get from around the web:

 - Giphy links
 - Google Image Search
 - YouTube search
 - Reddit integration
 - Customizable RSS feeds
 - Full Wikipedia articles
 - Stock fetching
 - Google Play Store links
 - MSN Weather forecast
 - Wolfram|Alpha data
 
In addition, he has many built-in utility functions:

 - Natural language unit conversion
 - Random number generator
 - Discord user profile
 - Server game list
 - Reminders via PM
 - Year countdown
 - Stats for members, games, and commands

And finally, AwesomeBot can conduct **in-chat polls** and offers a fun **live trivia game**. He is fully configurable via private message, and can be controlled independently between servers. New servers can be added simply by PMing the bot an invite link, and admins are automatically detected.

About
-----

This repository provides the source for the already-running `@AwesomeBot` instance. You are free to use this code as a base for your own bot, so long as you follow the following terms as well as the license:

1. If you modify the promotional message when the bot starts, you *must* add `-UNOFFICIAL` to the verison number on line 4
2. You may **not** remove the credit to @anandroiduser in the help section. If you wish, you may rephrase this along the lines of: `based on AwesomeBot <version> by @anandroiduser`
3. Join our private server if you are modifying the code in any way: [Join BotMakers, Inc.](https://discord.gg/0pRFCTcG2aIY53Jk)

Note that I am very busy with work, so this repository will only be updated for milestone releases and development may cease at any time. Also, I know this project is *very* poorly written; keep in mind that I have spent embarrassingly little time on this.

Setup
-----

1. Create a new Discord account for the bot
2. Make sure you have at least one mutual server with the bot's account
3. Clone this repository or download ZIP
4. Get [NodeJS](https://nodejs.org/en/) and NPM if you need to
5. Run `npm install` in the bot's directory to install the dependencies and then `node start.js` to get started!

You'll be prompted for authentication and configuration details, but here's a quick overview:  
 - **auth.json**:  
    - `email`: Email address for the bot's Discord account  
    - `password`: Password for the bot's Discord account  
    - `google_api_key`: Used for YouTube and Image Search queries, and can be found [here](https://console.developers.google.com/). Make sure to add the YouTube Data API to your account.  
    - `custom_search_id`: ID of an image-search Google CSE. Create a [custom search engine](https://cse.google.com/cse/create/new) that is configured to emulated Google Image Search  
    - `giphy_api_key`: [API key from Giphy](http://api.giphy.com/submit) for GIF search
    - `imgur_client_id`: Client ID from the Imgur API for uploading. You do not need to provide a redirect URL when you [register your application](https://imgur.com/signin?redirect=http://api.imgur.com/oauth2/addclient), and your Client ID can be anonymous
    - `wolfram_app_id`: Sign up for a [Wolfram developer account](https://developer.wolframalpha.com/portal/apisignup.html), add your application, and find its ID
    - `openexchangerates_app_id`: App ID for currency conversion via Open Exchange Rates. Sign up for free access [here](https://openexchangerates.org/signup/free)
 - **config.json**:
    - `hosting`: Publicly available URL of bot's web interface (optional)
    - `maintainer`: Your *personal* Discord ID to be notified of updates and to access the maintainer console where you can change the bot status, game, etc. (highly recommended)
    - `game`: String of game that the bot will "play". If you fill in `maintainer`, you can change this live  

You can PM the bot `config <server name>` to access the admin console for the bot in any server where you are the admin and just `config` to access the maintainer console.

Extensions
----------

Starting with version 3.2, AwesomeBot supports extensions! They are code snippets run in response to a keyword or command, managed per-server via the admin console. To add an extension to a server, send a JSON file (described below) to the bot after logging into the admin console for a server.

The file you attach should have the following basic structure:

```
{
    name: name of extension,
    type: "keyword", "command", or "timer",
    key: array of keywords or one-word command,
    case: boolean for case sensitivity for a keyword, 
    interval: timer interval in seconds,
    usage: (optional) parameters for a command, e.g. "<param1> <param2>",
    channels: (optional) array of applicable channel names,
    process: code to execute, as a string
}
```

`process` is the crucial component here (you can compress your code into a string [using this website](http://javascriptcompressor.com/)). This code is given 3 seconds to run in a sandbox, with access to the following:

 - `unirest`: lightweight HTTP request library
 - `imgur`: preauthenticated `imgur-node-api` module
 - `image`: Google Image Search, usage `image(query, "&start=num", callback(url))`
 - `message`: full content of the message
 - `author`: tag for the sender
 - `setTimeout`, `JSON`, `Math`, `isNaN`, `Date`, `Array`, `Number`
 - `send`: write final output to this
 
Note: For timer extensions, you will not be given an `author` or `message`, and `channels` and `interval` are required in your extension JSON file.
 
Outside of this sandbox, the extension cannot use other Node modules or methods. If a message is identified as an extension target, `send` must have a value within 1.5 seconds or the bot will not repond to the command/keyword. You are also responsible for validiing the message if you are using a command to ensure that it contains the proper parameters. When sending the JSON file to the bot, it will run several tests to verify its integrity and validity. If it is acceptable, you can remove it at any time in the admin console.

Changelog
---------

Latest, version **3.3**:

 - Added last seen in user profiles
 - New `say` command, just for fun
 - Added currency conversion
 - Added timer extension type
 - New auto-update system (beta)
 - Maintainer console to change bot game, status, etc.
 - Prevent bot spam with verification system
 - Added message archiving in admin console
 - Option for PMs when mentioned
 - New stats system for members and games
 - Per-server command usage info
 - Improved toggles in admin console
 - Command-line setup on first run 
 - Persistent reminders with PM support
 - About command for bot info
 - Revamped logging system with filters
 - Added poll timestamps and PM voting
 - Enhanced web interface with themes and stats
 - Made bot status persistent
 - Support for YouTube playlists and channels
 - Improved roll command with optional min and max
 - Fixed many, many bugs  

Patch #1: Fixed username quote bug in web interface  
Patch #2: Another web interface fix  
Patch #3: Tweaked button/select color in web interface
 
Open an issue to report a bug or suggest a new feature!

Contribute
----------

Please feel free to make pull requests or open an issue on this repository. Any help is appreciated!
