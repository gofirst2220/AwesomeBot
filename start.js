try {
    // Get all the basic modules and files setup
    const Discord = require("discord.js");
    var configs = require("./data/config.json");
    const AuthDetails = require("./auth.json");
    var profileData = require("./data/profiles.json");
    var stats = require("./data/stats.json");
    var filter = require("./filter.json");
    var reminders = require("./data/reminders.json");

    // Hijack spawn for auto-update to work properly
    (function() {
        var childProcess = require("child_process");
        childProcess.spawn = require("cross-spawn");
    })();

    // Misc. modules to make everything work
    const writeFileAtomic = require("write-file-atomic");
    const youtube_node = require("youtube-node");
    const unirest = require("unirest");
    const request = require("request");
    const levenshtein = require("fast-levenshtein");
    const htmlToText = require("html-to-text");
    const qs = require("querystring");
    const fs = require("fs");
    const Wiki = require("wikijs");
    const convert = require("convert-units");
    const imgur = require("imgur-node-api");
    var wolfram;
    const urban = require("urban");
    const weather = require("weather-js");
    const fx = require("money");
    const cheerio = require("cheerio");
    const util = require("util");
    const vm = require("vm");
    const quotable = require("forbes-quote");
    const readline = require("readline");
    const searcher = require("google-search-scraper");
    const urlInfo = require("url-info-scraper");
} catch(startError) {
    console.log("Failed to start: ");
    console.log(startError);
    console.log("Exiting...");
    process.exit(1);
}

// Bot setup
var version = "3.3.3-Unofficial";
var outOfDate = 0;
var readyToGo = false;
var logs = [];
var disconnects = 0;

// Set up message counter
var messages = {};

// Chatterbot setup, both Mitsuku and Cleverbot
var cleverOn = {};
const mitsuku = require("mitsuku-api")();
var bots = {};
const Cleverbot = require("cleverbot-node");
var cleverbot = new Cleverbot;

// Spam detection stuff
var spams = {};

// Stuff for ongoing polls, trivia games, reminders, and admin console sessions
var polls = {};
var trivia = {};
var adminconsole = {};
var admintime = {};
var updateconsole = false;
var maintainerconsole = false
var onlineconsole = {};

// Stuff for voting and lotteries
var novoting = {};
var pointsball = 20;
var lottery = {};

// List of bot commands along with usage and process for each
var commands = {
    // Checks if bot is alive and shows version and uptime
    "ping": {
        extended: "A useful command to tell if the bot is alive. Also displays AwesomeBot version and status page URL if available.",
        process: function(bot, msg) {
            var info = "Pong! " + bot.user.username + " v" + version + " running for " + secondsToString(bot.uptime/1000);
            if(configs.hosting!="") {
                info =  info.substring(0, info.length-1);
                info += ". Status: " + configs.hosting;
            }
            bot.sendMessage(msg.channel, info);
        }
    },
    // About AwesomeBot!
    "about": {
        extended: "Tells you all about the bot and where to get more info.",
        process: function(bot, msg) {
            bot.sendMessage(msg.channel, "Hello! I'm **" + bot.user.username + "**, here to help everyone on this server. A full list of commands and features is available with `@" + bot.user.username + " help`. You can PM me an invite link to add me to another server. To learn more, check out my GitHub page (https://git.io/vaa2F) or join the Discord server (https://discord.gg/0pRFCTcG2aIY53Jk)\n\n*v" + version + " by **@BitQuote**, made with NodeJS*");
        }
    },
    // Shows top 5 games and active members
    "stats": {
        usage: "[clear]",
        extended: "Shows the most active members, most played games, and most used commands on this server for this week. If you are an admin in this server, you can use the `clear` option to reset stats for this week.",
        process: function(bot, msg, suffix) {
            if(!stats[msg.channel.server.id]) {
                logMsg(new Date().getTime(), "ERROR", msg.channel.server.name, msg.channel.name, "Failed to read stats");
                bot.sendMessage(msg.channel, "Somehow, some way, I don't have any stats for this server :worried:");
                return;
            }
            
            var data = getStats(msg.channel.server);
            var info = "**" + msg.channel.server.name + " (this week)**"
            for(var cat in data) {
                info += "\n" + cat + ":" + (cat=="Data since" ? (" " + data[cat]) : "");
                if(cat!="Data since") {
                    for(var i=0; i<data[cat].length; i++) {
                        info += "\n\t" + data[cat][i];
                    }
                }
            }
            bot.sendMessage(msg.channel, info);
            
            if(suffix.toLowerCase()=="clear" && configs.servers[msg.channel.server.id].admins.value.indexOf(msg.author.id)>-1) {
                stats.timestamp = new Date().getTime();
                clearServerStats(msg.channel.server.id);
                logMsg(new Date().getTime(), "INFO", msg.channel.server.name, msg.channel.name, "Cleared stats for at admin's request");
            }
        }
    },
    // Gets Forbes Quote of the Day
    "quote": {
        extended: "Get the Forbes Quote of the Day as well as the author and URL.",
        process: function(bot, msg) {
            quotable().then(function (quote) {
                bot.sendMessage(msg.channel, "`" + quote.quote + "`\n\t- " + quote.author + ": " + quote.url);
            });
        } 
    },
    // Searches Google for a given query
    "search": {
        usage: "<query> [<count>]",
        extended: "Searches Google for a given query. You can use the optional count parameter to specify the number of results to get (1-5).",
        process: function(bot, msg, suffix) {
            if(suffix) {
                var query = suffix.substring(0, suffix.lastIndexOf(" "));
                var count = parseInt(suffix.substring(suffix.lastIndexOf(" ")+1));

                if(query=="" || !query || isNaN(count)) {
                    query = suffix;
                    count = 5;
                }
                if(count<1 || count>5) {
                    count = 5;
                }
                var options = {
                    query: query,
                    limit: count
                };
                var i = 0;
                searcher.search(options, function(err, url) {
                    if(!err) {
                        urlInfo(url, function(error, linkInfo) {
                            if(i<count) {
                                i++;
                                if(!error) {
                                    bot.sendMessage(msg.channel, "**" + linkInfo.title + "**\n" + url + "\n");
                                } else {
                                    bot.sendMessage(msg.channel, url + "\n");
                                }
                            }
                        });
                    }
                });
            } else {
                logMsg(new Date().getTime(), "WARN", msg.channel.server.name, msg.channel.name, "No search parameters");
                bot.sendMessage(msg.channel, msg.author + " ???");
            }
        }
    },
    // Fetches Twitter user timelines
    "twitter": {
        usage: "<username> [<count>]",
        extended: "Fetches the Twitter timeline for a given user. Do not include `@` in the username and use the optional count parameter to specify the number of tweets to get (1-5).",
        process: function(bot, msg, suffix) {
            if(suffix) {
                var user = suffix.substring(0, suffix.indexOf(" "));
                var count = parseInt(suffix.substring(suffix.indexOf(" ")+1));

                if(user=="" || !user || isNaN(count)) {
                    user = suffix;
                    count = 0;
                }
                rssfeed(bot, msg, "http://twitrss.me/twitter_user_to_rss/?user=" + user, count, false);
            } else {
                logMsg(new Date().getTime(), "WARN", msg.channel.server.name, msg.channel.name, "Twitter parameters not provided");
                bot.sendMessage(msg.channel, msg.author + " You confuse me.");
            }
        }
    },
    // Gets YouTube link with given keywords
    "youtube": {
        usage: "<video tags>",
        extended: "Gets a YouTube link with the given search terms. This includes channels, videos, and playlists.",
        process: function(bot, msg, suffix) {
            if(!suffix) {
                logMsg(new Date().getTime(), "WARN", msg.channel.server.name, msg.channel.name, "User did not provide search term(s)");
                bot.sendMessage(msg.channel, msg.author + " What should I search YouTube for?");
                return;
            }
            ytSearch(suffix, function(link) {
                bot.sendMessage(msg.channel, link);
            });
        }
    },
    // New Year Countdown
    "year": {
        extended: "The exact amount of time until next year!",
        process: function(bot, msg) {
            var a = new Date();
            var e = new Date(a.getFullYear()+1, 0, 1, 0, 0, 0, 0);
            var info = secondsToString((e-a)/1000) + "until " + (a.getFullYear()+1) + "!";
            bot.sendMessage(msg.channel, info);
        }
    },
    // Says something
    "say": {
        usage: "<something>",
        process: function(bot, msg, suffix) {
            if(!suffix) {
                bot.sendMessage(msg.channel, "\t\n");
            } else {
                bot.sendMessage(msg.channel, msg.cleanContent.substring(bot.user.username.length+6));
            }
        }
    },
    // Allows approved users (essentially bot admins) to change chatterbot engine
    "chatterbot": {
        usage: "[switch]",
        extended: "Displays the chatterbot currently in use, either Cleverbot or Mitsuku. Bot admins can use the `switch` option to toggle between these.",
        process: function(bot, msg, suffix) {
            if(configs.servers[msg.channel.server.id].admins.value.indexOf(msg.author.id)>-1) {
                var isSwitch = suffix.toLowerCase() === "switch";
                if (isSwitch) cleverOn[msg.channel.server.id] = !cleverOn[msg.channel.server.id];
                var using = !cleverOn[msg.channel.server.id] ? "Mitsuku" : "Cleverbot";
                
                if(isSwitch) {
                    logMsg(new Date().getTime(), "INFO", "Switched to " + using + " chatterbot");
                    bot.sendMessage(msg.channel, "Now using " + using + " for conversations.");
                } else {
                    bot.sendMessage(msg.channel, "Currently using " + using + " for conversations.");
                }
            } else {
                logMsg(new Date().getTime(), "WARN", msg.channel.server.name, msg.channel.name, "User is not a bot admin");
                bot.sendMessage(msg.channel, msg.author + " Only my friends can do that.");
            }
        }
    },
    // Searches Google Images with keyword(s)
    "image": {
        usage: "<image tags> [random]",
        extended: "Searches Google Images with a given query and returns the first result. Use the `random` option to get a random result instead.",
        process: function(bot, msg, suffix) {
            var numstr = "";
            if(!suffix) {
                logMsg(new Date().getTime(), "WARN", msg.channel.server.name, msg.channel.name, "User did not provide search term(s)");
                bot.sendMessage(msg.channel, msg.author + " I don't know what image to get...");
                return;
            } else if(suffix.substring(suffix.lastIndexOf(" ")+1).toLowerCase()=="random") {
                if(suffix.substring(0, suffix.lastIndexOf(" "))) {
                    suffix = suffix.substring(0, suffix.lastIndexOf(" "));
                    numstr = "&start=" + getRandomInt(0, 19);
                }
            }
            giSearch(suffix, numstr, function(img) {
                if(!img) {
                    bot.sendMessage(msg.channel, "Couldn't find anything, sorry");
                    logMsg(new Date().getTime(), "WARN", msg.channel.server.name, msg.channel.name, "Image results not found for " + suffix)
                } else {
                    bot.sendMessage(msg.channel, img);
                }
            });
        }
    },
    // Get GIF from Giphy
    "gif": {
		usage: "<GIF tags>",
        extended: "Gets a ~~meme~~ GIF fom Giphy with the given tags.",
		process: function(bot, msg, suffix) {
            if(!suffix) {
                logMsg(new Date().getTime(), "WARN", msg.channel.server.name, msg.channel.name, "User did not provide GIF search term(s)");
                bot.sendMessage(msg.channel, msg.author + " I don't know of a GIF for nothing.");
                return;
            }
		    var tags = suffix.split(" ");
            var rating = "pg-13";
            if(!configs.servers[msg.channel.server.id].nsfwfilter.value || !configs.servers[msg.channel.server.id].servermod.value) {
                rating = "r";
            }
		    getGIF(tags, function(id) {
                if(typeof id!=="undefined") {
                    bot.sendMessage(msg.channel, "http://media.giphy.com/media/" + id + "/giphy.gif");
                } else {
                    logMsg(new Date().getTime(), "WARN", msg.channel.server.name, msg.channel.name, "GIF not found for " + suffix);
                    bot.sendMessage(msg.channel, "The Internet has run out of memes :/");
                }
		    }, rating);
		}
	},
    // Defines word from Urban Dictionary
    "urban": {
        usage: "<term>",
        extended: "Defines the given word. Source: Urban Dictionary",
        process: function(bot, msg, suffix) {
            var def = urban(suffix);
            def.first(function(data) {
                if(data) {
                    bot.sendMessage(msg.channel, "**" + suffix + "**: " + data.definition.replace("\r\n\r\n", "\n") + "\n*" + data.example.replace("\r\n\r\n", "\n") + "*\n`" + data.thumbs_up + " up, " + data.thumbs_down + " down`");
                } else {
                    logMsg(new Date().getTime(), "WARN", msg.channel.server.name, msg.channel.name, "Definition not found for " + suffix);
                    bot.sendMessage(msg.channel, "Wtf?! Urban Dictionary doesn't have an entry for " + suffix);
                }
            });
        }
    },
    // Queries Wolfram Alpha
    "wolfram" : {
        usage: "<Wolfram|Alpha query>",
        extended: "Displays an entire Wolfram|Alpha knowledge page about a given topic or person. This includes formulas, graphs, and more. May take some time to process.",
        process(bot, msg, suffix) {
            if(!suffix) {
                logMsg(new Date().getTime(), "WARN", msg.channel.server.name, msg.channel.name, "User did not provide Wolfram|Alpha query");
                bot.sendMessage(msg.channel, msg.author + " I'm confused...");
                return;
            }
            wolfram.ask({query: suffix}, function(err, results) {
                if(err) {
                    logMsg(new Date().getTime(), "ERROR", msg.channel.server.name, msg.channel.name, "Unable to connect to Wolfram|Alpha");
                    bot.sendMessage(msg.channel, "Unfortunately, I didn't get anything back from Wolfram|Alpha");
                } else {
                    var info = ""
                    try {
                        for(var i=0; i<results.pod.length; i++) {
                            var fact = results.pod[i].subpod[0].plaintext[0] || results.pod[i].subpod[0].img[0].$.src;
                            info += "**" + results.pod[i].$.title + "**\n" + fact + "\n";
                        }
                        bot.sendMessage(msg.channel, info);
                    } catch(notFound) {
                        logMsg(new Date().getTime(), "WARN", msg.channel.server.name, msg.channel.name, "Could not find Wolfram|Alpha data for " + suffix);
                        bot.sendMessage(msg.channel, "Wolfram|Alpha has nothing.");
                    }
                }
            });
        }
    },
    // Gets Wikipedia article with given title
    "wiki": {
        usage: "<search terms>",
        extended: "Shows the first three paragraphs of the Wikipedia article matching the given search terms. Make your query specific.",
        process: function(bot, msg, suffix) {
            if(!suffix) {
                logMsg(new Date().getTime(), "WARN", msg.channel.server.name, msg.channel.name, "User did not provide Wikipedia search term(s)");
                bot.sendMessage(msg.channel, msg.author + " You need to provide a search term.");
                return;
            }
            new Wiki().search(suffix,1).then(function(data) {
                if(data.results.length==0) {
                    logMsg(new Date().getTime(), "WARN", msg.channel.server.name, msg.channel.name, "Wikipedia article not found for " + suffix);
                    bot.sendMessage(msg.channel, "I don't think Wikipedia has an article on that.");
                    return;
                }
                new Wiki().page(data.results[0]).then(function(page) {
                    page.summary().then(function(summary) {
                        if(summary.indexOf(" may refer to:") > -1 || summary.indexOf(" may stand for:") > -1) {
                            logMsg(new Date().getTime(), "WARN", msg.channel.server.name, msg.channel.name, "Ambiguous search term '" + suffix + "' provided");
                            bot.sendMessage(msg.channel, "There are several matching Wikipedia articles; try making your query more specific.");
                        } else {
                            var sumText = summary.split("\n");
                            var count = 0;
                            var continuation = function() {
                                var paragraph = sumText.shift();
                                if(paragraph && count<3) {
                                    count++;
                                    bot.sendMessage(msg.channel, paragraph, continuation);
                                }
                            };
                            continuation();
                        }
                    });
                });
            }, function(err) {
                logMsg(new Date().getTime(), "ERROR", msg.channel.server.name, msg.channel.name, "Unable to connect to Wikipedia");
                bot.sendMessage(msg.channel, "Uhhh...Something went wrong :(");
            });
        }
    },
    // Converts between units
    "convert": {
        usage: "<no.> <unit> to <unit>",
        extended: "Converts between units of measurement and currencies. Specify the quantity, starting unit, and end unit. The last two should be separated with ` to `",
        process: function(bot, msg, suffix) {
            var toi = suffix.lastIndexOf(" to ");
            if(toi==-1) {
                logMsg(new Date().getTime(), "WARN", msg.channel.server.name, msg.channel.name, "User used incorrect conversion syntax");
                bot.sendMessage(msg.channel, msg.author + " Sorry, I didn't get that. Make sure you're using the right syntax: `@" + bot.user.username + " <no.> <unit> to <unit>`");
            } else {
                try {
                    var num = suffix.substring(0, suffix.indexOf(" "));
                    var unit = suffix.substring(suffix.indexOf(" ")+1, suffix.lastIndexOf(" to ")).toLowerCase();
                    var end = suffix.substring(suffix.lastIndexOf(" ")+1).toLowerCase();
                    
                    if(isNaN(num)) {
                        logMsg(new Date().getTime(), "WARN", msg.channel.server.name, msg.channel.name, "User did not provide a numeric conversion quantity");
                        bot.sendMessage(msg.channel, msg.author + " That's not a number...");
                        return;
                    }
                    if(convert().possibilities().indexOf(unit)!=-1) {
                        if(convert().from(unit).possibilities().indexOf(end)!=-1) {
                            bot.sendMessage(msg.channel, (Math.round(convert(num).from(unit).to(end) * 1000) / 1000) + " " + end);
                            return;
                        }
                    }
                    try {
                        bot.sendMessage(msg.channel, (Math.round(fx.convert(num, {from: unit.toUpperCase(), to: end.toUpperCase()}) * 100) / 100) + " " + end.toUpperCase());
                    } catch(error) {
                        logMsg(new Date().getTime(), "WARN", msg.channel.server.name, msg.channel.name, "Unsupported conversion unit(s)");
                        bot.sendMessage(msg.channel, msg.author + " I don't support that unit, try something else.");
                    }
                } catch(err) {
                    logMsg(new Date().getTime(), "WARN", msg.channel.server.name, msg.channel.name, "User used incorrect convert syntax");
                    bot.sendMessage(msg.channel, msg.author + " Are you sure you're using the correct syntax?");
                }
            }
        }
    },
    // Fetches stock symbol from Yahoo Finance
    "stock": {
        usage: "<stock symbol>",
        extended: "Fetches basic information about a stock *symbol* from Yahoo! Finance.",
        process: function(bot, msg, suffix) {
            if(!suffix) {
                logMsg(new Date().getTime(), "WARN", msg.channel.server.name, msg.channel.name, "User did not provide stock symbol");
                bot.sendMessage(msg.channel, msg.author + " You never gave me a stock symbol! I'm not a magician, you know.");
                return;
            }
            unirest.get("http://finance.yahoo.com/webservice/v1/symbols/" + suffix + "/quote?format=json&view=detail")
            .header("Accept", "application/json")
            .end(function(result) {
                if(result.status==200 && JSON.parse(result.raw_body).list.resources[0]) {
                    var data = JSON.parse(result.raw_body).list.resources[0].resource.fields;
                    var info = data.issuer_name + " (" + data.symbol + ")\n\t$" + (Math.round((data.price)*100)/100) + "\n\t";
                    info += " " + (Math.round((data.change)*100)/100) + " (" + (Math.round((data.chg_percent)*100)/100) + "%)\n\t$" + (Math.round((data.day_low)*100)/100) + "-$" + (Math.round((data.day_high)*100)/100);
                    bot.sendMessage(msg.channel, info);
                } else {
                    logMsg(new Date().getTime(), "WARN", msg.channel.server.name, msg.channel.name, "Stock symbol " + suffix + " not found")
                    bot.sendMessage(msg.channel, "Sorry, I can't find that stock symbol.");
                }
            });
        }
    },
    // Displays the weather for an area
    "weather": {
        usage: "<location> [<\"F\" or \"C\">]",
        extended: "Gets the current weather and forecast for a given location from MSN Weather. Use the optional unit parameter (`F` or `C`) to change the unit (Fahrenheit is the default).",
        process: function(bot, msg, suffix) {
            var unit = "F";
            var location = suffix;
            if([" F", " C"].indexOf(suffix.substring(suffix.length-2))>-1) {
                unit = suffix.charAt(suffix.length-1).toString();
                location = suffix.substring(0, suffix.length-2);
            }
            weather.find({search: location, degreeType: unit}, function(err, data) {
                if(err) {
                    logMsg(new Date().getTime(), "WARN", msg.channel.server.name, msg.channel.name, "Could not find weather for location " + location);
                    bot.sendMessage(msg.channel, msg.author + " I can't find weather info for " + location);
                } else {
                    data = data[0];
                    bot.sendMessage(msg.channel, "**" + data.location.name + " right now:**\n" + data.current.temperature + "°" + unit + " " + data.current.skytext + ", feels like " + data.current.feelslike + "°, " + data.current.winddisplay + " wind\n**Forecast for tomorrow:**\nHigh: " + data.forecast[1].high + "°, low: " + data.forecast[1].low + "° " + data.forecast[1].skytextday + " with " + data.forecast[1].precip + "% chance precip.");
                }
            });
        }
    },
    // Silences the bot until the start statement is issued
    "quiet": {
        usage: "[all]",
        extended: "Turns off the bot in this channel, or the whole server if you use the `all` option. You must be a bot admin in this server to use this command.",
        process: function(bot, msg, suffix) {
            if(configs.servers[msg.channel.server.id].admins.value.indexOf(msg.author.id)>-1 && suffix.toLowerCase()=="all") {
                for(var i=0; i<msg.channel.server.channels; i++) {
                    stats[msg.channel.server.id].botOn[msg.channel.server.channels[i].id] = false;
                }
            } else if(configs.servers[msg.channel.server.id].admins.value.indexOf(msg.author.id)>-1) {
                stats[msg.channel.server.id].botOn[msg.channel.id] = false;
            } else {
                logMsg(new Date().getTime(), "WARN", msg.channel.server.name, msg.channel.name, msg.author.username + " is not a bot admin and cannot quiet bot");
                bot.sendMessage(msg.channel,msg.author + " Sorry, I won't listen to you :P");
                return;
            }
            bot.sendMessage(msg.channel, "Ok, I'll shut up.");
            logMsg(new Date().getTime(), "INFO", msg.channel.server.name, msg.channel.name, "Bot has been quieted by an admin");
        }
    },
    // Starts, ends, and answers live trivia game
    "trivia": {
        usage: "<start, end, next, or answer choice>",
        extended: "AwesomeTrivia! *A fun group trivia game with really hard questions and a weird answer acceptance system.* Use `start` to begin playing, `next` to skip, and `end` to see your score.",
        process: function(bot, msg, suffix) {
            var triviaOn = trivia[msg.channel.id]!=null;
            switch(suffix) {
                case "start":
                    if(!triviaOn) {
                        logMsg(new Date().getTime(), "INFO", msg.channel.server.name, msg.channel.name, "Trivia game started");
                        trivia[msg.channel.id] = {answer: "", attempts: 0, score: 0, possible: 0};
                        bot.sendMessage(msg.channel, "Welcome to **AwesomeTrivia**! Here's your first question: " + triviaQ(msg.channel.id) + "\nAnswer by tagging me like this: `@" + bot.user.username + " trivia <answer>` or skip by doing this: `@" + bot.user.username + " trivia next`\nGood Luck!");
                        trivia[msg.channel.id].possible++;
                        if(!stats[msg.channel.server.id].commands.trivia) {
                            stats[msg.channel.server.id].commands.trivia = 0;
                        }
                        stats[msg.channel.server.id].commands.trivia++;
                    } else {
                        logMsg(new Date().getTime(), "WARN", msg.channel.server.name, msg.channel.name, "Ongoing trivia game; new one cannot be started");
                        bot.sendMessage(msg.channel, "There's a trivia game already in progress on this server, in " + msg.channel.name);
                    }
                    break;
                case "end":
                    if(triviaOn) {
                        var outof = trivia[msg.channel.id].possible-1;
                        if(trivia[msg.channel.id].possible==1) {
                            outof = 1;
                        }
                        logMsg(new Date().getTime(), "INFO", msg.channel.server.name, msg.channel.name, "Trivia game ended, score: " + trivia[msg.channel.id].score + " out of " + outof);
                        bot.sendMessage(msg.channel, "Thanks for playing! Y'all got " + trivia[msg.channel.id].score + " out of " + outof);
                        delete trivia[msg.channel.id];
                    } else {
                        logMsg(new Date().getTime(), "WARN", msg.channel.server.name, msg.channel.name, "No ongoing trivia game to end");
                        bot.sendMessage(msg.channel, "There isn't a trivia game going on right now. Start one by typing `@" + bot.user.username + " trivia start`");
                    }
                    break;
                case "next":
                    if(triviaOn) {
                        logMsg(new Date().getTime(), "INFO", msg.channel.server.name, msg.channel.name, "Trivia question skipped by " + msg.author.username);
                        bot.sendMessage(msg.channel, "The answer was " + trivia[msg.channel.id].answer + "\n**Next Question:** " + triviaQ(msg.channel.id));
                        trivia[msg.channel.id].possible++;
                    } else {
                        logMsg(new Date().getTime(), "WARN", msg.channel.server.name, msg.channel.name, "No ongoing trivia game in which to skip question");
                        bot.sendMessage(msg.channel, "There isn't a trivia game going on right now. Start one by typing `@" + bot.user.username + " trivia start`");
                    }
                    break;
                default:
                    if(triviaOn) {
                        if(levenshtein.get(suffix.toLowerCase(), trivia[msg.channel.id].answer.toLowerCase())<3 && triviaOn) {
                            logMsg(new Date().getTime(), "INFO", msg.channel.server.name, msg.channel.name, "Correct trivia game answer by " + msg.author.username);
                            bot.sendMessage(msg.channel, msg.author + " got it right! The answer is " + trivia[msg.channel.id].answer);
                            
                            // Award AwesomePoints to author
                            if(!profileData[msg.author.id]) {
                                profileData[msg.author.id] = {
                                    points: 0
                                };
                            }
                            profileData[msg.author.id].points += 5;
                            saveData("./data/profiles.json", function(err) {
                                if(err) {
                                    logMsg(new Date().getTime(), "ERROR", "General", null, "Failed to save profile data for " + msg.author.username);
                                }
                            });
                            
                            // Move on to next question
                            if(trivia[msg.channel.id].attempts<=2) {
                                trivia[msg.channel.id].score++;
                            }
                            trivia[msg.channel.id].attempts = 0;

                            bot.sendMessage(msg.channel, "**Next Question:** " + triviaQ(msg.channel.id));
                            trivia[msg.channel.id].possible++;
                        } else if(triviaOn) {
                            bot.sendMessage(msg.channel, msg.author + " Nope :(");
                            trivia[msg.channel.id].attempts++;
                        }
                    } else {
                        logMsg(new Date().getTime(), "WARN", msg.channel.server.name, msg.channel.name, "No ongoing trivia game to answer");
                        bot.sendMessage(msg.channel, "There isn't a trivia game going on right now. Start one by typing `@" + bot.user.username + " trivia start`");
                    }
            }
        }
    },
    // Sends reminders in given time for given note
    "remindme": {
        usage: "<no.> <\"d\", \"h\", \"m\", or \"s\"> <note>",
        extended: "Set a reminder for yourself in a given number of days, hours, minutes, or seconds. You will be reminded via PM. You can also use a natural language command, for example: `remindme to do the dishes in 5 h`.",
        process: function(bot, msg, suffix) {
            parseReminder(suffix, msg.author, msg.channel);
        }
    },
    // Gets top (max 5) posts in given subreddit, sorting hot
    "reddit": {
        usage: "<subreddit> [<count>]",
        extended: "Gets the top 5 HOT posts in a given sub on Reddit. Use the optional `count` parameter to specify the number of posts to get (1-5).",
        process: function(bot, msg, suffix) {
            var path = "/.json"
            var count = 5;
            if(suffix) {
                if(suffix.indexOf(" ")>-1) {
                    var sub = suffix.substring(0, suffix.indexOf(" "));
                    count = suffix.substring(suffix.indexOf(" ")+1);
                    if(count.indexOf(" ")>-1) {
                        count = count.substring(0, count.indexOf(" "));
                    }
                    path = "/r/" + sub + path;
                } else {
                    path = "/r/" + suffix + path;
                }
            } else {
                sub = "all";
                count = 5;
            }
            if(!sub || !count || isNaN(count)) {
                sub = suffix;
                count = 5;
            }
            if(count<1 || count>5) {
                count = 5;
            }
            unirest.get("https://www.reddit.com" + path)
            .header("Accept", "application/json")
            .end(function(result) {
                if(result.body.data) {
                    var data = result.body.data.children;
                    var info = "";
                    var c = count;
                    for(var i=0; i<c; i++) {
                        if(!data[i] || !data[i].data || !data[i].data.score) {
                            logMsg(new Date().getTime(), "WARN", msg.channel.server.name, msg.channel.name, "Subreddit not found or Reddit unavailable");
                            bot.sendMessage(msg.channel, "Surprisingly, I couldn't find anything in " + sub + " on reddit.");
                            return;
                        } else if(data[i].data.over_18 && configs.servers[msg.channel.server.id].admins.value.indexOf(msg.author.id)==-1 && configs.servers[msg.channel.server.id].nsfwfilter.value && configs.servers[msg.channel.server.id].servermod.value) {
                            logMsg(new Date().getTime(), "INFO", msg.channel.server.name, msg.channel.name, "Handling filtered query from " + msg.author.username);
                            kickUser(msg, "is abusing the bot", "attempting to fetch NSFW content");
                            if(configs.servers[msg.channel.server.id].points.value) {
                                if(!profileData[msg.author.id]) {
                                    profileData[msg.author.id] = {
                                        points: 0
                                    }
                                }
                                profileData[msg.author.id].points -= 50;
                                saveData("./data/profiles.json", function(err) {
                                    if(err) {
                                        logMsg(new Date().getTime(), "ERROR", "General", null, "Failed to save profile data for " + msg.author.username);
                                    }
                                });
                            }
                            return;
                        } else if(!data[i].data.stickied) {
                            info += "`" + data[i].data.score + "` " + data[i].data.title + " **" + data[i].data.author + "** *" + data[i].data.num_comments + " comments*";
                            info += ", https://redd.it/" + data[i].data.id + "\n";
                        } else {
                            c++;
                        }
                    }
                    bot.sendMessage(msg.channel, info);
                } else {
                    logMsg(new Date().getTime(), "WARN", msg.channel.server.name, msg.channel.name, "Subreddit not found or Reddit unavailable");
                    bot.sendMessage(msg.channel, "Surprisingly, I couldn't find anything in " + sub + " on reddit.");
                }
            });
        }
    },
    // Gets top (max 5) posts in given RSS feed name 
    "rss": {
        usage: "<site> [<count>]",
        extended: "Gets entries in the given RSS feed. There are only certain feeds available; check the ones you can see in this server with the `help` command. Use the optional `count` parameter to specify the number of posts to get (1-5).",
        process: function(bot, msg, suffix) {
            if(configs.servers[msg.channel.server.id].rss.value[0]) {
                var site = suffix.substring(0, suffix.indexOf(" "));
                var count = parseInt(suffix.substring(suffix.indexOf(" ")+1));

                if(site=="" || !site || isNaN(count)) {
                    site = suffix;
                    count = 0;
                }
                if(configs.servers[msg.channel.server.id].rss.value[2].indexOf(site.toLowerCase())>-1) {
                    rssfeed(bot,msg,configs.servers[msg.channel.server.id].rss.value[1][configs.servers[msg.channel.server.id].rss.value[2].indexOf(site.toLowerCase())], count, false);
                } else {
                    logMsg(new Date().getTime(), "WARN", msg.channel.server.name, msg.channel.name, "Feed " + site + " not found");
                    bot.sendMessage(msg.channel, msg.author + " Feed not found.");
                }
            }
        }
    },
    // Generates a random number
    "roll": {
        usage: "[<min inclusive>] [<max inclusive>]",
        extended: "Generate a random number. Without any parameters, this will roll a 6-sided die. You can also provide a minimum (inclusive) *and* maximum (inclusive).",
        process: function(bot, msg, suffix) {
            if(suffix.indexOf(" ")>-1) {
                var min = suffix.substring(0, suffix.indexOf(" "));
                var max = suffix.substring(suffix.indexOf(" ")+1);
            } else if(!suffix) {
                var min = 1;
                var max = 6;
            } else {
                var min = 0;
                var max = suffix;
            }
            var roll = getRandomInt(parseInt(min), parseInt(max));
            if(isNaN(roll)) {
                logMsg(new Date().getTime(), "WARN", msg.channel.server.name, msg.channel.name, msg.author.username + " provided nonsensical roll parameter");
                bot.sendMessage(msg.channel, msg.author + " Wut.");
            } else {
                bot.sendMessage(msg.channel, msg.author + " rolled a " + parseInt(roll));
            }
        }
    },
    // Show list of games being played
    "games": {
        extended: "Lists the games being played on this server in descending order, along with the members playing them and the time played this week.",
        process: function(bot, msg) {
            var rawGames = {};
            for(var i=0; i<msg.channel.server.members.length; i++) {
                if(msg.channel.server.members[i].id!=bot.user.id && msg.channel.server.members[i].game && msg.channel.server.members[i].status!="offline") {
                    if(!rawGames[msg.channel.server.members[i].game.name]) {
                        rawGames[msg.channel.server.members[i].game.name] = [];
                    }
                    rawGames[msg.channel.server.members[i].game.name].push(msg.channel.server.members[i].username);
                }
            }
            var games = [];
            for(var game in rawGames) {
                var playingFor;
                if(stats[msg.channel.server.id].games[game]) {
                    playingFor = secondsToString(stats[msg.channel.server.id].games[game] * 3000) + "this week"; 
                }
                games.push([game, rawGames[game], playingFor]);
            }
            games.sort(function(a, b) {
                return a[1].length - b[1].length;
            });
            var info = "";
            for(var i=games.length-1; i>=0; i--) {
                info += "**" + games[i][0] + "** (" + games[i][1].length + ")";
                if(games[i][2]) {
                    info+="\n*" + games[i][2] + "*";
                }
                for(var j=0; j<games[i][1].length; j++) {
                    info += "\n\t@" + games[i][1][j];
                }
                info += "\n";
            }
            bot.sendMessage(msg.channel, info);
        }
    },
    // Get a user's full profile
    "profile": {
        usage: "<username>",
        extended: "The all-in-one command to view information about users. Providing no parameters will show your personal user profile on this server, including AwesomePoints, date joined, roles, and more. You can also provide a username as the parameter to view the profile of another member.",
        process: function(bot, msg, suffix) {
            var usr = msg.channel.server.members.get("username", suffix);
            if(!suffix) {
                usr = msg.author;
            } else if(suffix.charAt(0)=="<") {
                usr = msg.channel.server.members.get("id", suffix.substring(2, suffix.length-1));
            }
            if(usr) {
                var data = getProfile(usr, msg.channel.server);
                var info = "";
                for(var sect in data) {
                    info += "**" + sect + ":**\n";
                    for(var key in data[sect]) {
                        info += "\t" + key + ": " + data[sect][key] + "\n";
                    }
                }
                bot.sendMessage(msg.channel, info);
            } else {
                logMsg(new Date().getTime(), "WARN", msg.channel.server.name, msg.channel.name, "Requested member does not exist so profile cannot be shown");
                bot.sendMessage(msg.channel, "That user doesn't exist :/");
            }
        }
    },
    // Quickly gets a user's points
    "points": {
        usage: "<username or \"lottery\">",
        extended: "A quick way to get the number of points for a user. Use `me` if you want to see your own AwesomePoints, or use `lottery` to buy a PointsBall ticket!",
        process: function(bot, msg, suffix) {
            // Show points for user
            var usr = msg.channel.server.members.get("username", suffix);
            if(!suffix) {
                var memberPoints = [];
                for(var usrid in profileData) {
                    usr = msg.channel.server.members.get("id", usrid);
                    if(usr && profileData[usr.id].points>0) { 
                        memberPoints.push([usr.username, profileData[usr.id].points]); 
                    }
                }
                memberPoints.sort(function(a, b) {
                    return a[1] - b[1];
                });
                var info = "";
                for(var i=memberPoints.length-1; i>=0; i--) {
                    info += "**@" + memberPoints[i][0] + "**: " + memberPoints[i][1] + " AwesomePoint" + (memberPoints[i][1]==1 ? "" : "s") + "\n";
                }
                bot.sendMessage(msg.channel, info);
                return;
            // PointsBall lottery game!
            } else if(suffix=="lottery") {
                // Start new lottery in server (winner in 60 minutes)
                if(!lottery[msg.channel.server.id]) {
                    lottery[msg.channel.server.id] = {
                        members: [],
                        timestamp: new Date().getTime()
                    };
                    logMsg(new Date().getTime(), "INFO", msg.channel.server.name, msg.channel.name, "Lottery started, ends in 60 minutes");
                    setTimeout(function() {
                        var usrid = lottery[msg.channel.server.id].members[getRandomInt(0, lottery[msg.channel.server.id].members.length-1)];
                        var usr = msg.channel.server.members.get("id", usrid);
                        if(usr && !lottery[msg.channel.server.id].members.allValuesSame()) {
                            if(!profileData[usr.id]) {
                                profileData[usr.id] = {
                                    points: 0,
                                }
                            }
                            if(pointsball>1000000) {
                                pointsball = 20;
                            }
                            profileData[usr.id].points += pointsball;
                            logMsg(new Date().getTime(), "INFO", msg.channel.server.name, msg.channel.name, usr.username + " won the lottery for " + pointsball);
                            saveData("./data/profiles.json", function(err) {
                                if(err) {
                                    logMsg(new Date().getTime(), "ERROR", "General", null, "Failed to save profile data for " + usr.username);
                                }
                            });
                            bot.sendMessage(msg.channel.server.defaultChannel, "The PointsBall lottery amount is `" + pointsball + "` points, here's the winner..." + usr);
                        } else {
                            logMsg(new Date().getTime(), "WARN", msg.channel.server.name, msg.channel.name, "No winner of lottery for " + pointsball);
                            bot.sendMessage(msg.channel.server.defaultChannel, "The PointsBall lottery amount is `" + pointsball + "` points, here's the winner... NO ONE, rip");
                        }
                        delete lottery[msg.channel.server.id];
                        pointsball *= 2;
                    }, 3600000);
                }
                
                // Buy a lottery ticket
                lottery[msg.channel.server.id].members.push(msg.author.id);
                if(!profileData[msg.author.id]) {
                    profileData[msg.author.id] = {
                        points: 0,
                    }
                }
                profileData[msg.author.id].points -= 5;
                logMsg(new Date().getTime(), "INFO", msg.channel.server.name, msg.channel.name, msg.author.username + " bought a lottery ticket");
                bot.sendMessage(msg.channel, msg.author + " Thanks for buying a PointsBall ticket. That cost you 5 points. The lottery will end in " + secondsToString((lottery[msg.channel.server.id].timestamp + 3600000 - new Date().getTime())/1000));
                saveData("./data/profiles.json", function(err) {
                    if(err) {
                        logMsg(new Date().getTime(), "ERROR", "General", null, "Failed to save profile data for " + msg.author.username);
                    }
                });
                return;
            } else if(["me", "@me"].indexOf(suffix.toLowerCase())>-1) {
                usr = msg.author;
            } else if(suffix.charAt(0)=="<") {
                usr = msg.channel.server.members.get("id", suffix.substring(2, suffix.length-1));
            }
            if(usr) {
                if(!profileData[usr.id]) {
                    profileData[usr.id] = {
                        points: 0,
                    }
                    saveData("./data/profiles.json", function(err) {
                        if(err) {
                            logMsg(new Date().getTime(), "ERROR", "General", null, "Failed to save profile data for " + usr.username);
                        }
                    });
                }
                bot.sendMessage(msg.channel, "**@" + usr.username + "** has `" + profileData[usr.id].points + "` AwesomePoint" + (profileData[usr.id].points==1 ? "" : "s"));
            } else {
                logMsg(new Date().getTime(), "WARN", msg.channel.server.name, msg.channel.name, "Requested member does not exist so profile cannot be shown");
                bot.sendMessage(msg.channel, "That user doesn't exist :confused:");
            }
        }
    },
    // Displays list of options and RSS feeds
    "help": {
        usage: "[<command name>]",
        extended: "Shows the complete list of bot commands and features, specific to this server. You can include a command name as the parameter to get more information about it.",
        process: function(bot, msg, suffix) {
            if(!suffix) {
                bot.sendMessage(msg.channel, "Tag me then state one of the following commands:" + getHelp(msg.channel.server));
            } else {
                bot.sendMessage(msg.channel, getCommandHelp(msg.channel.server, suffix.toLowerCase()));
            }
        }
    }
};

var pmcommands = {
    // Configuration options in wizard or online for maintainer and admins
    "config": {
        usage: "[<server>]",
        extended: "Provides options to configure the bot overall or in a server. You must have privileges as the bot maintainer and/or admin in this server. Once you are authenticated, you will be " + (configs.hosting ? "given a link to the online interface for configuration" : "taken to a configuration wizard that allows you to enter configuration commands") + ".",
        process: function(bot, msg, suffix) {
            // Maintainer control panel for overall bot things
            if(msg.author.id==configs.maintainer && !suffix && !maintainerconsole) {
                logMsg(new Date().getTime(), "INFO", "General", null, "Maintainer console opened");
                if(configs.hosting) {
                    if(!onlineconsole[msg.author.id] && !adminconsole[msg.author.id]) {
                        onlineconsole[msg.author.id] = {
                            token: genToken(30),
                            type: "maintainer",
                            timer: setTimeout(function() {
                                logMsg(new Date().getTime(), "INFO", "General", null, "Timeout on online maintainer console");
                                delete onlineconsole[msg.author.id];
                            }, 180000)
                        };
                    } else if(onlineconsole[msg.author.id]) {
                        bot.sendMessage(msg.channel, "You already have an online console session open. Logout of that first or wait 3 minutes...");
                        return;
                    } else if(adminconsole[msg.author.id]) {
                        bot.sendMessage(msg.channel, "One step at a time...Finish configuring this server, then come back later!");
                        return;
                    }
                    
                    var url = (configs.hosting.charAt(configs.hosting.length-1)=='/' ? configs.hosting.substring(0, configs.hosting.length-1) : configs.hosting) + "?auth=" + onlineconsole[msg.author.id].token;
                    bot.sendMessage(msg.channel, url);
                } else {
                    bot.sendMessage(msg.channel, "**Welcome to the " + bot.user.username + " maintainer console.** I am your owner. I will do what you say. Here are your options:\n\tquit\n\tgame <name of game or `.` to remove>\n\tusername <new name>\n\tstatus <online or idle>\n\tupdate\n\tkill\nUse the syntax `<option> <parameter>` as always! :)");
                    maintainerconsole = true;
                }
                return;
            } else if(msg.author.id==configs.maintainer && maintainerconsole && !onlineconsole[msg.author.id]) {
                var n = "";
                var suffix = "";
                if(msg.content.indexOf(" ")>-1) {
                    n = msg.content.substring(0, msg.content.indexOf(" ")).toLowerCase();
                    suffix = msg.content.substring(msg.content.indexOf(" ")+1);
                } else {
                    n = msg.content.toLowerCase();
                }
                
                // Parse option and parameters
                if(!n || ["quit", "game", "username", "status", "update", "kill"].indexOf(n)==-1) {
                    logMsg(new Date().getTime(), "WARN", "General", null, "Maintainer provided invalid option in console");
                    bot.sendMessage(msg.channel, "Invalid option, please see list above.");
                    return;
                } else if((!suffix && ["game", "username", "status"].indexOf(msg.content)>-1) || (n=="status" && ["online", "idle"].indexOf(suffix)==-1)) {
                    logMsg(new Date().getTime(), "WARN", "General", null, "Maintainer provided invalid parameters in console");
                    bot.sendMessage(msg.channel, "Missing or incorrect parameter");
                    return;
                }
                switch(n) {
                    case "quit":
                        logMsg(new Date().getTime(), "INFO", "General", null, "Closed maintainer console");
                        bot.sendMessage(msg.channel, "Goodbye, master.");
                        maintainerconsole = false;
                        break;
                    case "game":
                        bot.setStatus("online", suffix);
                        if(suffix==".") {
                            suffix = "";
                            bot.setStatus("online", null);
                        }
                        logMsg(new Date().getTime(), "INFO", "General", null, "Set bot game to '" + suffix + "'");
                        configs.game = suffix;
                        saveData("./data/config.json", function(err) {
                            if(err) {
                                logMsg(new Date().getTime(), "ERROR", "General", null, "Could not save new config");
                                bot.sendMessage(msg.channel, "An unknown error occurred *saving* that change :crying_cat_face:");
                            } else {
                                bot.sendMessage(msg.channel, suffix=="" ? "Ok, removed game from status" : ("Ok, now I'm playing `" + suffix + "`"));
                            }
                        });
                        break;
                    case "username":
                        if(suffix==bot.user.username) {
                            logMsg(new Date().getTime(), "WARN", "General", null, "Maintainer provided existing username");
                            bot.sendMessage(msg.channel, "That's already my name! Haha");
                            return;
                        }
                        bot.setUsername(suffix, function(err) {
                            if(err) {
                                logMsg(new Date().getTime(), "ERROR", "General", null, "Failed to change username to " + suffix);
                                bot.sendMessage(msg.channel, "Uh-oh, something went wrong :o");
                            } else {
                                logMsg(new Date().getTime(), "INFO", "General", null, "Changed bot username to " + suffix);
                                bot.sendMessage(msg.channel, "Done!");
                            }
                        });
                        break;
                    case "status":
                        bot.setStatus(suffix, function(err) {
                            if(err) {
                                logMsg(new Date().getTime(), "ERROR", "General", null, "Failed to change status to " + suffix);
                                bot.sendMessage(msg.channel, "Discord is being weird, try again later");
                            } else {
                                logMsg(new Date().getTime(), "INFO", "General", null, "Changed bot status to " + suffix);
                                bot.sendMessage(msg.channel, "Ok, I am now `" + suffix + "`");
                            }
                        });
                        break;
                    case "update":
                        if(outOfDate>0) {
                            updateBot(msg);
                        } else {
                            bot.sendMessage(msg.channel, bot.user.username + " is up-to-date!");
                        }
                        break;
                    case "kill":
                        logMsg(new Date().getTime(), "INFO", "General", null, "Kill command issued by maintainer");
                        bot.sendMessage(msg.channel, "RIP", function(err) {
                            process.exit(0);
                        });
                        break;
                }
                return;
            }
            
            // Admin control panel, check to make sure the config command was valid
            if(suffix && !adminconsole[msg.author.id]) {
                var svr = bot.servers.get("name", msg.content.substring(msg.content.indexOf(" ")+1));
                // Check if specified server exists
                if(!svr) {
                    logMsg(new Date().getTime(), "WARN", msg.author.id, null, "User provided invalid server for admin console");
                    bot.sendMessage(msg.channel, "Sorry, invalid server. Try again?");
                // Check if sender is an admin of the specified server
                } else if(configs.servers[svr.id].admins.value.indexOf(msg.author.id)>-1) {
                    // Check to make sure no one is already using the console
                    if(!activeAdmins(svr.id)) {
                        adminconsole[msg.author.id] = svr.id;
                        // Ok, all conditions met, logged into admin console
                        logMsg(new Date().getTime(), "INFO", msg.author.id, null, "Admin console launched for " + svr.name);
                        
                        if(configs.hosting && !onlineconsole[msg.author.id]) {
                            onlineconsole[msg.author.id] = {
                                token: genToken(30),
                                type: "admin",
                                svrid: svr.id,
                                timer: setTimeout(function() {
                                    logMsg(new Date().getTime(), "INFO", msg.author.id, null, "Timeout on online admin console for " + svr.name);
                                    delete adminconsole[msg.author.id];
                                    delete onlineconsole[msg.author.id];
                                }, 180000)
                            };
                            
                            var url = (configs.hosting.charAt(configs.hosting.length-1)=='/' ? configs.hosting.substring(0, configs.hosting.length-1) : configs.hosting) + "?auth=" + onlineconsole[msg.author.id].token;
                            bot.sendMessage(msg.channel, url);
                        } else if(!onlineconsole[msg.author.id]) {
                            // Display options for the admin
                            var info = "Welcome to the admin console for server " + svr.name + ". Your options are:";
                            info += "\n\tquit";
                            for(var i=0; i<Object.keys(configs.servers[svr.id]).length; i++) {
                                if(Object.keys(configs.servers[svr.id])[i]!="extensions") {
                                    info += "\n\t" + Object.keys(configs.servers[svr.id])[i] + " " + configs.servers[svr.id][Object.keys(configs.servers[svr.id])[i]].option;
                                }
                            }
                            info += "\n\tclean <channel name> <no. of messages>"
                            info += "\n\tleave *remove bot from server*";
                            info += "\n\tclose *ongoing trivia/polls*";
                            info += "\n\tarchive <channel name> <no. of messages>"
                            info += "\n\textension <name of extension to delete>"
                            info += "\n\tlist *current configs*";
                            info += "\nUse the syntax `<option> <parameter(s)>`, or PM me a JSON file to set up an extension (to learn more about this, go to https://git.io/vaaaU)";
                            bot.sendMessage(msg.channel, info);
                            admintime[msg.author.id] = setTimeout(function() {
                                if(adminconsole[msg.author.id]) {
                                    logMsg(new Date().getTime(), "INFO", msg.author.id, null, "Timeout on admin console session for " + svr.name);
                                    delete adminconsole[msg.author.id];
                                    bot.sendMessage(msg.channel, "It's been 3 minutes, so I'm assuming you're done here. Goodbye!");
                                }
                            }, 180000);
                        } else {
                            bot.sendMessage(msg.channel, "You already have an online console session open. Logout of that first or wait 3 minutes...");
                            delete adminconsole[msg.author.id];
                        }
                    } else {
                        logMsg(new Date().getTime(), "WARN", msg.author.id, null, "Admin console for " + svr.name + " already active");
                        bot.sendMessage(msg.channel, "Another admin is in the console already. Please try again later.");
                    }
                } else {
                    logMsg(new Date().getTime(), "WARN", msg.author.id, null, "User is not a bot admin of " + svr.name);
                    bot.sendMessage(msg.channel, "You are not an admin for that server.");
                }
                return;
            // Check if this is an admin command
            } else if(adminconsole[msg.author.id] && !onlineconsole[msg.author.id]) {
                // Reset admin console timer
                clearTimeout(admintime[msg.author.id]);
                admintime[msg.author.id] = setTimeout(function() {
                    if(adminconsole[msg.author.id]) {
                        logMsg(new Date().getTime(), "INFO", msg.author.id, null, "Timeout on admin console session for " + svr.name);
                        delete adminconsole[msg.author.id];
                        bot.sendMessage(msg.channel, "It's been 3 minutes, so I'm assuming you're done here. Goodbye!");
                    }
                }, 180000);
                
                // Get the server in question
                var svr = bot.servers.get("id", adminconsole[msg.author.id]);
                
                // Checks for attachment to apply extension
                if(msg.attachments.length>0) {
                    unirest.get(msg.attachments[0].url).end(function(result) {
                        try {
                            var extension = JSON.parse(result.raw_body);
                            addExtension(extension, svr, msg.author.id, function(err) {
                                if(err && typeof err=="string") {
                                    bot.sendMessage(msg.channel, "Well, that didn't work. Here's the error: `" + validity + "`");
                                } else if(err) {
                                    bot.sendMessage(msg.channel, "An unknown error occurred, but at least *your* code was fine");
                                } else {
                                    var info = "Great, it works! You can use this extension on the server now.\nUpdated extension list:";
                                    for(var ext in configs.servers[svr.id].extensions) {
                                        info += "\n\t" + ext + ", " + configs.servers[svr.id].extensions[ext].type;
                                    }
                                    bot.sendMessage(msg.channel, info);
                                }
                            });
                        } catch(error) {
                            logMsg(new Date().getTime(), "WARN", msg.author.id, null, "Invalid extension file uploaded for " + svr.name);
                            bot.sendMessage(msg.channel, "Hmmm, couldn't process that. Make sure the file is a valid JSON.");
                        }
                    });
                } else {
                    // Parses option in message
                    var n = msg.content;
                    var suffix = "";
                    if(msg.content.indexOf(" ")>-1) {
                        n = msg.content.substring(0, msg.content.indexOf(" "));
                        suffix = msg.content.substring(msg.content.indexOf(" ")+1);
                    }
                    if((Object.keys(configs.servers[svr.id]).indexOf(n)==-1 && ["quit", "clean", "leave", "close", "archive", "extension", "list"].indexOf(n)==-1) || n=="extensions") {
                        logMsg(new Date().getTime(), "WARN", msg.author.id, null, "Invalid admin console option");
                        bot.sendMessage(msg.channel, "Invalid option, try again.");
                        return;
                    }
                    if(suffix=="" && ["quit", "remove", "leave", "close", "list"].indexOf(n)==-1) {
                        logMsg(new Date().getTime(), "WARN", msg.author.id, null, "Parameter not provided for option " + n + " in admin console for " + svr.name);
                        bot.sendMessage(msg.channel, "Missing parameter. Please see your options above.");
                        return;
                    }
                    
                    // Do different things based on n
                    switch(n) {
                        // Exit admin console
                        case "quit":
                            delete adminconsole[msg.author.id];
                            bot.sendMessage(msg.channel, "Goodbye!");
                            logMsg(new Date().getTime(), "INFO", msg.author.id, null, "Admin wizard for " + svr.name + " closed");
                            return;
                        // Add/remove users from admins list for this server
                        case "admins":
                            if(isNaN(suffix)) {
                                var usr = svr.members.get("username", suffix);
                            } else {
                                var usr = svr.members.get("id", suffix);
                            }
                            var info = "";
                            if(!usr) {
                                logMsg(new Date().getTime(), "WARN", msg.author.id, null, "Member not found for admin list in " + svr.name);
                                bot.sendMessage(msg.channel, "Sorry, no such user.");
                                return;
                            } else if(configs.servers[svr.id].admins.value.indexOf(usr.id)>0) {
                                if(usr.id==msg.author.id) {
                                    logMsg(new Date().getTime(), "WARN", msg.author.id, null, "Cannot remove themselves from admins list for " + svr.name)
                                    bot.sendMessage(msg.channel, "You can't remove yourself! Loooool");
                                    return;
                                } else if(usr.id==configs.maintainer) {
                                    logMsg(new Date().getTime(), "WARN", msg.author.id, null, "Cannot remove bot maintainer from admins list of " + svr.name);
                                }
                                logMsg(new Date().getTime(), "INFO", msg.author.id, null, "Removed " + usr.username + " as a bot admin in " + svr.name);
                                configs.servers[svr.id].admins.value.splice(configs.servers[svr.id].admins.value.indexOf(usr.id), 1);
                                info += usr.username + " is no longer a server admin.";
                            } else {
                                logMsg(new Date().getTime(), "INFO", msg.author.id, null, "Added " + usr.username + " as a bot admin in " + svr.name);
                                configs.servers[svr.id].admins.value.push(usr.id);
                                info += usr.username + " is now a server admin.";
                            }
                            info += "\nUpdated admins list for this server:";
                            for(var i=0; i<configs.servers[svr.id].admins.value.length; i++) {
                                info += "\n\t" + bot.users.get("id", configs.servers[svr.id].admins.value[i]).username + ", ID " + configs.servers[svr.id].admins.value[i];
                            }
                            saveData("./data/config.json", function(err) {
                                if(err) {
                                    logMsg(new Date().getTime(), "ERROR", "General", null, "Could not save new config for " + svr.name);
                                    bot.sendMessage(msg.channel, "An unknown error occurred.");
                                } else {
                                    bot.sendMessage(msg.channel, info);
                                }
                            });
                            break;
                        // Block/unblock users
                        case "blocked":
                            if(suffix==".") {
                                logMsg(new Date().getTime(), "INFO", msg.author.id, null, "Cleared blocked list for " + svr.name);
                                configs.servers[svr.id].blocked.value = [];
                                var info = "Cleared blocked member list.";
                            } else {
                                if(isNaN(suffix)) {
                                    var usr = svr.members.get("username", suffix);
                                } else {
                                    var usr = svr.members.get("id", suffix);
                                }
                                var info = "";
                                if(!usr) {
                                    logMsg(new Date().getTime(), "WARN", msg.author.id, null, "Member not found to block in " + svr.name);
                                    bot.sendMessage(msg.channel, "Sorry, no such user.");
                                    return;
                                } else if(configs.servers[svr.id].blocked.value.indexOf(usr.id)>-1) {
                                    logMsg(new Date().getTime(), "INFO", msg.author.id, null, "Unblocked " + usr.username + " in " + svr.name);
                                    configs.servers[svr.id].blocked.value.splice(configs.servers[svr.id].blocked.value.indexOf(usr.id), 1);
                                    info += "Removed user " + usr.username + " from blocked list.";
                                } else {
                                    if(configs.servers[svr.id].admins.value.indexOf(usr.id)>-1) {
                                        logMsg(new Date().getTime(), "WARN", msg.author.id, null, "Cannot block another bot admin in " + svr.name);
                                        bot.sendMessage(msg.channel, "You can't block other bot admins in the server. That would be mean.");
                                    } else if(usr.id==configs.maintainer) {
                                        logMsg(new Date().getTime(), "WARN", msg.author.id, null, "Cannot block bot maintainer from " + svr.name);
                                    } else if(usr.id==msg.author.id) {
                                        logMsg(new Date().getTime(), "WARN", msg.author.id, null, "Cannot block themselves in " + svr.name);
                                        bot.sendMessage(msg.channel, "You can't block yourself! Lol");
                                    } else {
                                        logMsg(new Date().getTime(), "INFO", msg.author.id, null, "Blocked " + usr.username + " in " + svr.name);
                                        configs.servers[svr.id].blocked.value.push(usr.id);
                                        info += "Blocked user " + usr.username + " from using this bot in this server.";
                                    }
                                }
                                info += "\nUpdated blocked list for this server:";
                                for(var i=0; i<configs.servers[svr.id].blocked.value.length; i++) {
                                    info += "\n\t" + bot.users.get("id", configs.servers[svr.id].blocked.value[i]).username + ", ID " + configs.servers[svr.id].blocked.value[i];
                                }
                                if(configs.servers[svr.id].blocked.value.length==0) {
                                    info += "\n\tNo users are blocked.";
                                }
                            }
                            saveData("./data/config.json", function(err) {
                                if(err) {
                                    logMsg(new Date().getTime(), "ERROR", "General", null, "Could not save new config for " + svr.name);
                                    bot.sendMessage(msg.channel, "An unknown error occurred.");
                                } else {
                                    bot.sendMessage(msg.channel, info);
                                }
                            });
                            break;
                        // Change the new member greeting
                        case "newgreeting":
                            var info = "";
                            if(suffix==".") {
                                configs.servers[svr.id].newgreeting.value = "";
                                info = "has been removed.";
                            } else {
                                configs.servers[svr.id].newgreeting.value = suffix;
                                info = "will now include: `" + suffix + "`";
                            }
                            saveData("./data/config.json", function(err) {
                                if(err) {
                                    logMsg(new Date().getTime(), "ERROR", "General", null, "Could not save new config for " + svr.name);
                                    bot.sendMessage(msg.channel, "An unknown error occurred.");
                                } else {
                                    logMsg(new Date().getTime(), "INFO", msg.author.id, null, "New greeting in " + svr.name + ": " + suffix);
                                    bot.sendMessage(msg.channel, "The greeting message for new members " + info);
                                }
                            });
                            break;
                        // Adds, removes, and turns on/off RSS feeds
                        case "rss":
                            var info = "";
                            if(suffix.toLowerCase()=="y" || suffix.toLowerCase()=="n") {
                                var prev = configs.servers[svr.id].rss.value[0] ? "y" : "n";
                                var yn = suffix.toLowerCase()=="y" ? "on" : "off";
                                if(suffix.toLowerCase()==prev) {
                                    info = "Command `rss` is already " + yn;
                                    bot.sendMessage(msg.channel, info);
                                    return;
                                }
                                info = "Command `rss` has been turned ";
                                if(suffix.toLowerCase()=="y") {
                                    configs.servers[svr.id].rss.value[0] = true;
                                } else if(suffix.toLowerCase()=="n") {
                                    configs.servers[svr.id].rss.value[0] = false;
                                }
                                info += yn;
                                logMsg(new Date().getTime(), "INFO", msg.author.id, null, "Command " + n + " turned " + yn + " in " + svr.name);
                            } else if(suffix.indexOf(" ")>-1) {
                                var url = suffix.substring(0, suffix.indexOf(" "));
                                var nm = suffix.substring(suffix.indexOf(" ")+1);
                                if(nm.indexOf(" ")>-1) {
                                    logMsg(new Date().getTime(), "WARN", msg.author.id, null, "Invalid feed name provided in admin console for " + svr.name);
                                    info += "Invalid feed name.";
                                } else {
                                    configs.servers[svr.id].rss.value[1].push(url);
                                    configs.servers[svr.id].rss.value[2].push(nm);
                                    logMsg(new Date().getTime(), "INFO", msg.author.id, null, "Feed " + nm + " added in " + svr.name);
                                    info += "Feed " + nm + " added.";
                                }
                            } else {
                                if(configs.servers[svr.id].rss.value[2].indexOf(suffix)>-1) {
                                    configs.servers[svr.id].rss.value[1].splice(configs.servers[svr.id].rss.value[2].indexOf(suffix), 1);
                                    configs.servers[svr.id].rss.value[2].splice(configs.servers[svr.id].rss.value[2].indexOf(suffix), 1);
                                    logMsg(new Date().getTime(), "INFO", msg.author.id, null, "Feed " + suffix + " removed in " + svr.name);
                                    info += "Removed feed " + suffix;
                                } else {
                                    info += "No matching feed found.";
                                }
                            }
                            saveData("./data/config.json", function(err) {
                                if(err) {
                                    logMsg(new Date().getTime(), "ERROR", msg.author.id, null, "Could not save new config for " + svr.name);
                                    bot.sendMessage(msg.channel, "There was an error saving your changes.");
                                } else {
                                    bot.sendMessage(msg.channel, info);
                                }
                            });
                            break;
                        // Clean past messages
                        case "clean":
                            if(suffix.indexOf(" ")==-1) {
                                logMsg(new Date().getTime(), "WARN", msg.author.id, null, "Parameter not provided for option " + n + " in admin console for " + svr.name);
                                bot.sendMessage(msg.channel, "Missing parameter. Make sure to include the number of messages to delete *and* the channel name.");
                                return;
                            }
                            var ch = svr.channels.get("name", suffix.substring(0, suffix.indexOf(" ")));
                            var count = suffix.substring(suffix.indexOf(" ")+1);
                            if(isNaN(count) || !ch) {
                                logMsg(new Date().getTime(), "WARN", msg.author.id, null, "Incorrect parameters provided for option incorrect parameter(s) for option " + n + " in admin console for " + svr.name);
                                bot.sendMessage(msg.channel, "You've made a terrible mistake! Something's wrong with your command...");
                                return;
                            }
                            cleanMessages(ch, count, null, function(err) {
                                if(err) {
                                    bot.sendMessage(msg.channel, "Something went wrong getting messages from Discord :cry:");
                                } else {
                                    bot.sendMessage(msg.channel, "Deleted those messages in " + ch.name);
                                }
                            });
                            break;
                        // Server management
                        case "leave":
                            bot.leaveServer(svr, function(error) {
                                if(error) {
                                    logMsg(new Date().getTime(), "ERROR", "General", null, "Failed to leave server " + svr.name);
                                    bot.sendMessage(msg.channel, "Failed to leave server.");
                                } else {
                                    delete configs.servers[svr.id];
                                    delete messages[svr.id];
                                    delete cleverOn[svr.id];
                                    delete stats[svr.id];
                                    logMsg(new Date().getTime(), "INFO", "General", null, "Left server " + svr.name);
                                    bot.sendMessage(msg.channel, bot.user.username + " has left " + svr.name);
                                    delete adminconsole[msg.author.id];
                                }
                            });
                            break;
                        // Close polls and trivia games by force
                        case "close":
                            for(var i=0; i<svr.channels.length; i++) {
                                if(trivia[svr.channels[i].id]) {
                                    bot.sendMessage(svr.channels[i], "Sorry to interrupt your game, but an admin has closed this trivia session.");
                                    commands["trivia"].process(bot, {"channel": svr.channels[i]}, "end");
                                    logMsg(new Date().getTime(), "INFO", msg.author.id, null, "Closed trivia game in " + svr.channels[i].name + ", " + svr.name);
                                    delete trivia[svr.channels[i].id];
                                    bot.sendMessage(msg.channel, "Closed a trivia game in " + svr.channels[i].name);
                                }
                                var act = activePolls(svr.channels[i].id);
                                if(act) {
                                    bot.sendMessage(svr.channels[i], "The ongoing poll in this channel has been closed by an admin.");
                                    bot.sendMessage(svr.channels[i], pollResults(act, "The results are in", "and the winner is"));
                                    logMsg(new Date().getTime(), "INFO", msg.author.id, null, "Closed active poll in " + svr.channels[i].name + ", " + svr.name);
                                    delete polls[act];
                                    bot.sendMessage(msg.channel, "Closed a poll in " + svr.channels[i].name);
                                }
                            }
                            break;
                        // Archive messages in a channel
                        case "archive":
                            if(suffix.indexOf(" ")==-1) {
                                logMsg(new Date().getTime(), "WARN", msg.author.id, null, "Parameter not provided for option " + n + " in admin console for " + svr.name);
                                bot.sendMessage(msg.channel, "Missing parameter. Make sure to include the number of messages to archive *and* the channel name.");
                                return;
                            }
                            var ch = svr.channels.get("name", suffix.substring(0, suffix.indexOf(" ")));
                            var count = suffix.substring(suffix.indexOf(" ")+1);
                            if(isNaN(count) || !ch) {
                                logMsg(new Date().getTime(), "WARN", msg.author.id, null, "Incorrect parameters provided for option incorrect parameter(s) for option " + n + " in admin console for " + svr.name);
                                bot.sendMessage(msg.channel, ":o :o :o");
                                return;
                            }
                            archiveMessages(ch, count, function(err, archive) {
                                if(err) {
                                    bot.sendMessage(msg.channel, "Something went wrong getting messages from Discord :cry:");
                                } else {
                                    writeFileAtomic("./" + ch.id + ".json", JSON.stringify(archive, null, 4), function(error) {
                                        if(error) {
                                            logMsg(new Date().getTime(), "ERROR", ch.server.name, ch.name, "Failed to write archive file");
                                            bot.sendMessage(open, "I couldn't generate an archive file, sorry");
                                        } else {
                                            bot.sendFile(open, "./" + ch.id + ".json", function(writeError) {
                                                if(writeError) {
                                                    logMsg(new Date().getTime(), "WARN", ch.server.name, ch.name, "Archive file too large");
                                                    bot.sendMessage(open, "Discord won't let me send this file to you. Try a smaller number of messages...");
                                                } else {
                                                    fs.unlink("./" + ch.id + ".json");
                                                }
                                            });
                                        }
                                    });
                                }
                            });
                            break;
                        // Delete an extension
                        case "extension":
                            if(configs.servers[svr.id].extensions[suffix]) {
                                delete configs.servers[svr.id].extensions[suffix];
                                logMsg(new Date().getTime(), "INFO", msg.author.id, null, "Deleted extension " + suffix + " from " + svr.name);
                                var info = "Deleted extension " + suffix + " from this server.\nUpdated extension list:";
                                for(var ext in configs.servers[svr.id].extensions) {
                                    info += "\n\t" + ext + ", " + configs.servers[svr.id].extensions[ext].type;
                                }
                                if(Object.keys(configs.servers[svr.id].extensions).length==0) {
                                    info += "\n\tNo extensions added.";
                                }
                            } else {
                                logMsg(new Date().getTime(), "WARN", msg.author.id, null, "Extension " + suffix + " not found in " + svr.name);
                                bot.sendMessage(msg.channel, "Extension " + suffix + " isn't on this server.");
                            }
                            saveData("./data/config.json", function(err) {
                                if(err) {
                                    logMsg(new Date().getTime(), "ERROR", msg.author.id, null, "Could not save new config for " + svr.name);
                                    bot.sendMessage(msg.channel, "There was an error saving your changes.");
                                } else {
                                    bot.sendMessage(msg.channel, info);
                                }
                            });
                            break;
                        // Display all current options
                        case "list":
                            var info = "Bot admins:";
                            for(var i=0; i<configs.servers[svr.id].admins.value.length; i++) {
                                info += "\n\t" + bot.users.get("id", configs.servers[svr.id].admins.value[i]).username + ", ID " + configs.servers[svr.id].admins.value[i];
                            }
                            info += "\nBlocked users:";
                            for(var i=0; i<configs.servers[svr.id].blocked.value.length; i++) {
                                info += "\n\t" + bot.users.get("id", configs.servers[svr.id].blocked.value[i]).username + ", ID " + configs.servers[svr.id].blocked.value[i];
                            }
                            if(configs.servers[svr.id].blocked.value.length==0) {
                                info += "\n\tNo users are blocked.";
                            }
                            if(Object.keys(configs.servers[svr.id].extensions).length>0) {
                                info += "\nExtension list:";
                                for(var ext in configs.servers[svr.id].extensions) {
                                    info += "\n\t" + ext + ", " + configs.servers[svr.id].extensions[ext].type;
                                }
                            }
                            info += "\nRSS feeds:";
                            for(var i=0; i<configs.servers[svr.id].rss.value[2].length; i++) {
                                info += "\n\t" + configs.servers[svr.id].rss.value[2][i];
                            }
                            if(configs.servers[svr.id].rss.value[2].length==0) {
                                info += "\n\tNo RSS feeds available.";
                            }
                            if(configs.servers[svr.id].servermod.value) {
                                info += "\nBot will act as a server moderator.";
                                if(configs.servers[svr.id].newgreeting.value!="") {
                                    info += "\nSpecial message for new members: `" + configs.servers[svr.id].newgreeting.value + "`";
                                } else {
                                    info += "\nCustom new member message not set.";
                                }
                                if(configs.servers[svr.id].spamfilter.value) {
                                    info += "\nBot will try to detect spam and notify admins."
                                }
                                if(configs.servers[svr.id].nsfwfilter.value) {
                                    info += "\nFiltering NSFW bot queries."
                                }
                            }
                            info += "\nCommand settings:";
                            for(var i=0; i<Object.keys(configs.servers[svr.id]).length; i++) {
                                if(["admins", "blocked", "newgreeting", "servermod", "spamfilter", "nsfwfilter", "chatterbot", "extensions"].indexOf(Object.keys(configs.servers[svr.id])[i])==-1) {
                                    info += "\n\t " + Object.keys(configs.servers[svr.id])[i] + ", ";
                                    var check = configs.servers[svr.id][Object.keys(configs.servers[svr.id])[i]].value;
                                    if(Object.keys(configs.servers[svr.id])[i]=="rss") {
                                        check = configs.servers[svr.id][Object.keys(configs.servers[svr.id])[i]].value[0];
                                    }
                                    if(check) {
                                        info += "on";
                                    } else {
                                        info += "off";
                                    }
                                }
                            }
                            bot.sendMessage(msg.channel, info);
                            break;
                        // Commands settings (other than ones listed prior)
                        default:
                            var prev = configs.servers[svr.id].rss.value[0] ? "y" : "n";
                            var yn = suffix.toLowerCase()=="y" ? "on" : "off";
                            var info = "";
                            if(suffix.toLowerCase()==prev) {
                                info = "Command `" + n + "` is already " + yn;
                                bot.sendMessage(msg.channel, info);
                                return;
                            }
                            info = "Command `" + n + "` has been turned ";
                            if(suffix.toLowerCase()=="y") {
                                configs.servers[svr.id][n].value = true;
                                info += yn;
                            } else if(suffix.toLowerCase()=="n") {
                                configs.servers[svr.id][n].value = false;
                                info += yn;
                            } else {
                                logMsg(new Date().getTime(), "WARN", msg.author.id, null, "Invalid parameter provided for admin console option " + n + " in " + svr.name);
                                bot.sendMessage(msg.channel, "Invalid parameter, must be `y` or `n`.");
                                return;
                            }
                            logMsg(new Date().getTime(), "INFO", msg.author.id, null, "Command " + n + " turned " + yn + " in " + svr.name);
                            saveData("./data/config.json", function(err) {
                                if(err) {
                                    logMsg(new Date().getTime(), "ERROR", "General", null, "Could not save new config for " + svr.name);
                                    bot.sendMessage(msg.channel, "There was an error saving your changes.");
                                } else {
                                    bot.sendMessage(msg.channel, info);
                                }
                            });
                            break;
                    }
                }
                return;
            }
        }
    },
    // Set a reminder with natural language
    "remindme": {
        usage: commands.remindme.usage,
        extended: commands.remindme.extended,
        process: function(bot, msg, suffix) {
            if(suffix) {
                parseReminder(msg.content.substring(msg.content.indexOf(" ")+1), msg.author, null);
            } else {
                logMsg(new Date().getTime(), "WARN", msg.author.id, null, "User did provide remindme parameters");
                bot.sendMessage(msg.channel, "You know - I don't like people like you, expecting me to do things without even giving me any info!");
            }
        }
    },
    // Modify the value for a key in a user's profile
    "profile": {
        usage: "<key>,<value or \".\">",
        extended: "Sets or removes the value for a section in your profile. The key is the section name (for example: \"number of cats\") and should be somewhat short. The value is the information that goes with the key (continuing the example: \"4\"). Separate the key and value with only a comma. If you've already set the value for a given key, you can erase it with `<key>,.`",
        process: function(bot, msg, suffix) {
            if(suffix) {
                if(msg.content.indexOf(",")==-1) {
                    logMsg(new Date().getTime(), "WARN", msg.author.id, null, "User did not specify parameters for profile data");
                    bot.sendMessage(msg.channel, "Please include the name of the value as well as the value itself, separated by a comma.");
                    return;
                }
                var key = msg.content.substring(8,msg.content.indexOf(","));
                var value = msg.content.substring(msg.content.indexOf(",")+1);
                if(["id", "status", "points"].indexOf(key.toLowerCase())>-1) {
                    logMsg(new Date().getTime(), "WARN", msg.author.id, null, "User tried to assign default profile value");
                    bot.sendMessage(msg.channel, "You can't change the value for " + key);
                    return;
                }
                var info = "";
                if(value=="." && profileData[msg.author.id]) {
                    if(!profileData[msg.author.id][key]) {
                        logMsg(new Date().getTime(), "WARN", msg.author.id, null, "User tried to delete a nonexistent profile value");
                        bot.sendMessage(msg.channel, "I didn't have anything for " + key + " in the first place.");
                        return;
                    }
                    info = "Deleted.";
                    delete profileData[msg.author.id][key];
                } else {
                    if(!profileData[msg.author.id]) {
                        profileData[msg.author.id] = {
                            points: 0
                        };
                    }
                    info = "Alright, got it! PM me `" + key + ",.` to delete that.";
                    profileData[msg.author.id][key] = value;
                }
                saveData("./data/profiles.json", function(err) {
                    if(err) {
                        logMsg(new Date().getTime(), "ERROR", "General", null, "Failed to save profile data for " + msg.author.username);
                        bot.sendMessage(msg.channel, "Uh-oh, something went wrong. It wasn't you though.");
                    } else {
                        logMsg(new Date().getTime(), "INFO", msg.author.id, null, "Saved new key " + key + " in profile");
                        bot.sendMessage(msg.channel, info);
                    }
                });
            } else {
                logMsg(new Date().getTime(), "WARN", msg.author.id, null, "User did not provide profile parameters");
                bot.sendMessage(msg.channel, "C'mon, I need something to work with here!");
            }
        }
    },
    // Discreet say command
    "say": {
        usage: "<server> <channel> <something to say>",
        extended: "Says something in the main chat, seemingly spontaneously (you must be a bot admin in this server to use this command). Provide the server name, channel name, and something to say, separated by spaces and in that order.",
        process: function(bot, msg, suffix) {
            if(suffix) {
                var svrnm = msg.content.substring(msg.content.indexOf(" ")+1);
                var svr;
                do {
                    svrnm = svrnm.substring(0, svrnm.lastIndexOf(" "));
                    svr = bot.servers.get("name", svrnm);
                } while(!svr && svrnm.length>0);
                if(!svr) {
                    logMsg(new Date().getTime(), "WARN", msg.author.id, null, "User provided invalid server for discreet say");
                    bot.sendMessage(msg.channel, "Huh, that's not a server I know of. To add me, reply with the invite link. *kthx*");
                    return;
                }
                if(configs.servers[svr.id].admins.value.indexOf(msg.author.id)==-1) {
                    logMsg(new Date().getTime(), "WARN", msg.author.id, null, "Cannot say because user is not a bot admin in " + svr.name);
                    bot.sendMessage(msg.channel, "You're not an admin in that server :P");
                    return;
                }
                var chnm = msg.content.substring(svrnm.length+5);
                chnm = chnm.substring(0, chnm.indexOf(" "));
                var ch = svr.channels.get("name", chnm);
                if(!ch) {
                    logMsg(new Date().getTime(), "WARN", msg.author.id, null, "User provided invalid channel for discreet say");
                    bot.sendMessage(msg.channel, "There's no such channel on " + svr.name);
                    return;
                }
                var suffix = msg.content.substring(svrnm.length+chnm.length+6);
                if(!suffix) {
                    logMsg(new Date().getTime(), "WARN", msg.author.id, null, "No discreet message to say in " + svr.name + ", " + ch.name);
                    bot.sendMessage(msg.channel, "Idk what to say...Please use the syntax `say " + svr.name + " " + ch.name + " <something to say>`");
                    return;
                }
                bot.sendMessage(msg.channel, "Alright, check #" + ch.name)
                bot.sendMessage(ch, suffix);
                logMsg(new Date().getTime(), "INFO", svr.name, ch.name, "Saying '" + suffix + "' at admin's request via PM");
            } else {
                logMsg(new Date().getTime(), "WARN", msg.author.id, null, "User did provide parameters for discreet say command");
                bot.sendMessage(msg.channel, "Whaaaa...Make sure you read the help section for this command. I need a server, channel, and something to say (in that order).");
            }
        }
    },
    // Strawpoll-like poll creation
    "poll": {
        usage: "<server> <channel>",
        extended: "Starts a public poll in a channel. After providing the server and channel, you will be prompted for a question as well as answer options. Make the answer options logical and concise, separated only by commas. If the poll is yes/no, answer the prompt for options with just a period. You can reply `poll close` at any time during setup to abort, or to close the poll when people are done voting.",
        process: function(bot, msg, suffix) {
            // End poll if it has been initialized previously
            if(polls[msg.author.id] && msg.content.toLowerCase().indexOf("poll close")==0) {
                bot.sendMessage(msg.channel, "Poll ended.");
                var ch = bot.channels.get("id", polls[msg.author.id].channel);
                
                // Displays poll results if voting had occurred
                if(polls[msg.author.id].open) {
                    bot.sendMessage(ch, pollResults(msg.author.id, "The results are in", "and the winner is"));
                }

                // Clear out all the poll stuff
                delete polls[msg.author.id];
                logMsg(new Date().getTime(), "INFO", msg.author.id, null, "Poll ended in " + ch.name + ", " + ch.server.name);
                return;
            }
            // Starts a poll in a given channel via private message
            if(msg.author.id != bot.user.id && msg.content.toLowerCase().indexOf("poll")==0) {
                var svr = bot.servers.get("name", msg.content.substring(msg.content.indexOf(" ")+1, msg.content.lastIndexOf(" ")));
                if(!svr || !svr.members.get("id", msg.author.id)) {
                    logMsg(new Date().getTime(), "WARN", msg.author.id, null, "Invalid server provided for new poll");
                    bot.sendMessage(msg.channel, "That server doesn't exist or I'm not on it.");
                } else if(configs.servers[svr.id].blocked.value.indexOf(msg.author.id)==-1) {
                    var ch = svr.channels.get("name", msg.content.substring(msg.content.lastIndexOf(" ")+1));
                    if(!ch) {
                        logMsg(new Date().getTime(), "WARN", msg.author.id, null, "Invalid channel provided for new poll");
                        bot.sendMessage(msg.channel, "Invalid channel.");
                    } else if(stats[svr.id].botOn[ch.id]) {
                        if(configs.servers[svr.id].poll.value) {
                            if(polls[msg.author.id]) {
                                logMsg(new Date().getTime(), "WARN", msg.author.id, null, "User has already started a poll");
                                bot.sendMessage(msg.channel, "You've already started a poll. Close it before starting a new one.");
                            } else if(!activePolls(ch.id)) {
                                polls[msg.author.id] = {
                                    open: false,
                                    timestamp: new Date().getTime(),
                                    channel: ch.id,
                                    title: "",
                                    options: [],
                                    responderIDs: [],
                                    responses: []
                                };
                                if(!stats[svr.id].commands.poll) {
                                    stats[svr.id].commands.poll = 0;
                                }
                                stats[svr.id].commands.poll++;
                                logMsg(new Date().getTime(), "INFO", ch.server.name, ch.name, "Poll started by " + msg.author.username);
                                bot.sendMessage(msg.channel, "Enter the poll title or question:");
                            } else {
                                logMsg(new Date().getTime(), "WARN", msg.author.id, null, "Poll already active in " + ch.name + ", " + ch.server.name);
                                bot.sendMessage(msg.channel, "There's already a poll going on in that channel. Try again later.");
                            }
                        }
                    }
                }
            // Gets poll title from user and asks for poll options
            } else if(polls[msg.author.id] && polls[msg.author.id].title=="") {
                polls[msg.author.id].title = msg.content;
                bot.sendMessage(msg.channel, "Enter poll options, separated by commas, or `.` for yes/no:");
            // Gets poll options from user and starts voting
            } else if(polls[msg.author.id] && polls[msg.author.id].options.length==0) {
                if(msg.content==".") {
                    polls[msg.author.id].options = ["No", "Yes"];
                } else {
                    var start = 0;
                    for(var i=0; i<msg.content.length; i++) {
                        if(msg.content.charAt(i)==',') {
                            polls[msg.author.id].options.push(msg.content.substring(start, i));
                            start = i+1;
                        }
                    }
                    polls[msg.author.id].options.push(msg.content.substring(start, msg.content.length));
                }
                bot.sendMessage(msg.channel, "OK, got it. You can end the poll by sending me `poll close`.");
                polls[msg.author.id].open = true;

                var ch = bot.channels.get("id", polls[msg.author.id].channel);
                var info = msg.author + " has started a new poll: **" + polls[msg.author.id].title + "**";
                for(var i=0; i<polls[msg.author.id].options.length; i++) {
                    info += "\n\t" + i + ": " + polls[msg.author.id].options[i];
                }
                info += "\nYou can vote by typing `@" + bot.user.username + " vote <no. of choice>`. If you don't include a number, I'll just show results";
                bot.sendMessage(ch, info);
            }
        }
    },
    // Discreetly vote on an active poll
    "vote": {
        usage: "<server> <channel> <no. of choice>",
        extended: "Use this to vote on a poll privately (especially useful when your response is sensitive). Choose an answer option in the poll and remember its corresponding number (option numbers start at 0). Via PM, provide the server name, channel name, and the number of your choice. By the same token, if you vote either publicly or privately and decide you want to revoke your vote, use `.` instead of an option number.",
        process: function(bot, msg, suffix) {
            try {
                var vt = suffix.substring(suffix.lastIndexOf(" ")+1);
                suffix = suffix.substring(0, suffix.lastIndexOf(" "));
                var chnm = suffix.substring(suffix.lastIndexOf(" ")+1);
                suffix = suffix.substring(0, suffix.lastIndexOf(" "));
                var svrnm = suffix;
                var svr = bot.servers.get("name", svrnm);
                if(!svr) {
                    logMsg(new Date().getTime(), "WARN", msg.author.id, null, "User provided invalid server for PM voting");
                    bot.sendMessage(msg.channel, "I'm not on that server or it doesn't exist");
                    return;
                }
                var ch = svr.channels.get("name", chnm);
                if(!ch) {
                    logMsg(new Date().getTime(), "WARN", msg.author.id, null, "Channel does not exist for PM voting");
                    bot.sendMessage(msg.channel, svr.name + " doesn't have that channel. Please try again...");
                    return;
                }
                var act = activePolls(ch.id);
                if(!act) {
                    logMsg(new Date().getTime(), "WARN", msg.author.id, null, "No active poll on provided server/channel for PM voting");
                    bot.sendMessage(msg.channel, "There's no poll going on in that channel. Start one by replying `poll " + svr.name + " " + ch.name + "`");
                    return;
                }
                
                var f = polls[act].responderIDs.indexOf(msg.author.id);
                if(vt=="." && f>-1) {
                    logMsg(new Date().getTime(), "INFO", svr.name, ch.name, msg.author.username + "'s vote removed");
                    polls[act].responderIDs.splice(f, 1);
                    polls[act].responses.splice(f, 1);
                    bot.sendMessage(msg.channel, "OK, I removed your vote in the poll. You can vote again now.");
                    return;
                }
                if(isNaN(vt) || f>-1 || vt>=polls[act].options.length || vt<0) {
                    logMsg(new Date().getTime(), "WARN", msg.author.id, null, "User provided invalid PM vote for poll in " + svr.name + ", " + ch.name);
                    bot.sendMessage(msg.channel, "I couldn't cast your vote");
                    return;
                }
                polls[act].responses.push(vt);
                polls[act].responderIDs.push(msg.author.id);
                logMsg(new Date().getTime(), "INFO", svr.name, ch.name, "Vote cast for " + vt + " via PM");
                bot.sendMessage(msg.channel, "Got it! Your vote was cast anonymously ( ͡° ͜ʖ ͡°)");
            } catch(error) {
                logMsg(new Date().getTime(), "WARN", msg.author.id, null, "Invalid PM voting syntax provided");
                bot.sendMessage(msg.channel, "Hmmm, I didn't get that. Make sure to use the syntax `vote <server> <channel> <no. of option>`");
            }
        }
    },
    // View recent mentions/tags in a server
    "mentions": {
        usage: "<server>",
        extended: "Shows a list of messages in which you were mentioned in the past week. You can view the sender, time, and content of the message. Once you use this command, the mentions are cleared until you are mentioned in a new message.",
        process: function(bot, msg, suffix) {
            if(suffix) {
                var svr = bot.servers.get("name", msg.content.substring(9));
                if(!svr) {
                    logMsg(new Date().getTime(), "WARN", msg.author.id, null, "Invalid server provided for mentions");
                    bot.sendMessage(msg.channel, "I'm not on that server. You can reply with an invite link to add me!");
                    return;
                } else if(!svr.members.get("id", msg.author.id)) {
                    logMsg(new Date().getTime(), "WARN", msg.author.id, null, "User is not on " + svr.name + ", so mentions cannot be retreived");
                    bot.sendMessage(msg.channel, "*You're* not on " + svr.name + ". Obviously no one has mentioned you there!");
                    return;
                }
                
                var info = "";
                if(stats[svr.id].members[msg.author.id].mentions.stream.length>0) {
                    info = "**Mentions on " + svr.name + " in the last week**";
                    for(var i=0; i<stats[svr.id].members[msg.author.id].mentions.stream.length; i++) {
                        var time = prettyDate(new Date(stats[svr.id].members[msg.author.id].mentions.stream[i].timestamp))
                        info += "\n__*@" + stats[svr.id].members[msg.author.id].mentions.stream[i].author + " at " + time.substring(1, time.length-2) + ":*__\n" + stats[svr.id].members[msg.author.id].mentions.stream[i].message;
                    }
                    info += "\n\n";
                    stats[svr.id].members[msg.author.id].mentions.stream = [];
                } else {
                    info = "You haven't been mentioned on " + svr.name + " in the last week. I don't know if that's a good or bad thing...\n";
                }
                logMsg(new Date().getTime(), "INFO", msg.author.id, null, "User checked mentions in " + svr.name);
                info += "*Remember, you can " + (stats[svr.id].members[msg.author.id].mentions.pm ? "disable" : "enable") + " PMs for mentions with `pmmentions " + svr.name + "`*";
                bot.sendMessage(msg.channel, info);
            } else {
                logMsg(new Date().getTime(), "WARN", msg.author.id, null, "User did provide a server for mentions command");
                bot.sendMessage(msg.channel, "Gimme a server pls");
            }
        }
    },
    // Toggles PM mentions in a server
    "pmmentions": {
        usage: "<server>",
        extended: "Toggles PM mention notifications in a server. If this is turned on, I'll PM you if you get mentioned in the main chat and you're offline. This command turns on and off that setting.",
        process: function(bot, msg, suffix) {
            if(suffix) {
                var svr = bot.servers.get("name", msg.content.substring(11));
                if(!svr) {
                    logMsg(new Date().getTime(), "WARN", msg.author.id, null, "Invalid server provided for PM mentions");
                    bot.sendMessage(msg.channel, "I'm not on that server. You can reply with an invite link to add me!");
                    return;
                } else if(!svr.members.get("id", msg.author.id)) {
                    logMsg(new Date().getTime(), "WARN", msg.author.id, null, "User is not on " + svr.name + ", so mentions cannot be retreived");
                    bot.sendMessage(msg.channel, "*You're* not on " + svr.name + ". Obviously no one can mention you there!");
                    return;
                }
                
                stats[svr.id].members[msg.author.id].mentions.pm = !stats[svr.id].members[msg.author.id].mentions.pm;
                if(stats[svr.id].members[msg.author.id].mentions.pm) {
                    bot.sendMessage(msg.channel, "You will now receive PM notifications from me when someone mentions you in " + svr.name + ". Turn them off by replying with `pmmentions " + svr.name + "`");
                } else {
                    bot.sendMessage(msg.channel, "Turned off PMs for mentions in " + svr.name + ". Enable them again by replying with `pmmentions " + svr.name + "`");
                }
                saveData("./data/stats.json", function(err) {
                    if(err) {
                        logMsg(new Date().getTime(), "ERROR", "General", null, "Could not save updated PM preferences for " + msg.author.username);
                    } else {
                        logMsg(new Date().getTime(), "INFO", msg.author.id, null, "Turned " + (stats[svr.id].members[msg.author.id].mentions.pm ? "on" : "off") + " mention PMs in " + svr.name);
                    }
                });
            } else {
                logMsg(new Date().getTime(), "WARN", msg.author.id, null, "User did provide a server for pmmentions command");
                bot.sendMessage(msg.channel, "Server name please...`pmmentions <server>`");
            }
        }
    }
}

// Fetches posts from RSS feeds listed in config.json
function rssfeed(bot, msg, url, count, full) {
    if(count > 4 || !count || isNaN(count)) {
        count = 4;
    }
    var FeedParser = require("feedparser");
    var feedparser = new FeedParser();
    request(url).pipe(feedparser);
    feedparser.on("error", function(error){
        logMsg(new Date().getTime(), "ERROR", msg.channel.server.name, msg.channel.name, "Failed to read requested feed");
        bot.sendMessage(msg.channel, "Failed to read feed. Sorry.");
    });
    var shown = 0;
    feedparser.on("readable", function() {
        var stream = this;
        shown++;
        if(shown > count){
            return;
        }
        var item = stream.read();
        bot.sendMessage(msg.channel, item.title + " - " + item.link, function() {
            if(full === true){
                var text = htmlToText.fromString(item.description, {
                    wordwrap:false,
                    ignoreHref:true
                });
                bot.sendMessage(msg.channel, text);
            }
        });
        stream.alreadyRead = true;
    });
}

// Initializes bot and outputs to console
var bot = new Discord.Client({forceFetchUsers: true});
bot.on("ready", function() {
    checkVersion();
    
    // Clear stats and configs for old servers
    pruneData();
    
    // Make sure servers are properly configured and set variables
    for(var i=0; i<bot.servers.length; i++) {
        bot.startTyping(bot.servers[i].defaultChannel);
        // Populate stats file
        populateStats(bot.servers[i]);
        // Configure new servers
        if(!configs.servers[bot.servers[i].id]) {
            defaultConfig(bot.servers[i]);
        }
        // Make sure config.json is up-to-date
        checkConfig(bot.servers[i]);
        // Set runtime values
        cleverOn[bot.servers[i].id] = true;
        spams[bot.servers[i].id] = {};
        // Run timer extensions
        runTimerExtensions();
        // Send hello message
        bot.sendMessage(bot.servers[i].defaultChannel, "*I am " + bot.user.username + " v" + version + " by* **@BitQuote**, *https://git.io/vaa2F*");
        bot.stopTyping(bot.servers[i].defaultChannel);
    }
    
    // Set existing reminders
    for(var i=0; i<reminders.length; i++) {
        setReminder(i);
    }
    
    // Start message and stat tallies
    if(!stats.timestamp) {
        stats.timestamp = new Date().getTime();
    }
    clearMessageCounter();
    clearStatCounter();
    
    // Set playing game if applicable
    if(configs.game && configs.game!="") {
        bot.setStatus("online", configs.game);
    }
    
    // Give 50,000 maintainer points :P
    if(configs.maintainer) {
        if(!profileData[configs.maintainer]) {
            profileData[configs.maintainer] = {
                points: 50000
            };
        }
        if(profileData[configs.maintainer].points<50000) {
            profileData[configs.maintainer].points = 50000;
        }
        saveData("./data/profiles.json", function(err) {
            if(err) {
                logMsg(new Date().getTime(), "ERROR", "General", null, "Failed to save updated profile data");
            }
        });
    }

    // Set up webserver for online bot status, optimized for RedHat OpenShift deployment
    var express = require("express");
    var bodyParser = require("body-parser");
    var app = express();
    app.use(bodyParser.urlencoded({extended: true}));
    app.use(bodyParser.json());
    var server_port = process.env.OPENSHIFT_NODEJS_PORT || 8080;
    var server_ip_address = process.env.OPENSHIFT_NODEJS_IP || "127.0.0.1";
    
    app.get("/data", function(req, res) {
        var data = {};
        
        if(req.query.section=="list" && req.query.type) {
            if(req.query.type=="servers") {
                data.stream = [];
                for(var i=0; i<bot.servers.length; i++) {
                    data.stream.push([bot.servers[i].name.replaceAll("\"", "'"), bot.servers[i].id]);
                }
                data.stream.sort(function(a, b) {
                    a = a[0].toUpperCase();
                    b = b[0].toUpperCase();
                    return a < b ? -1 : a > b ? 1 : 0;
                });
            } else if(req.query.type=="members" && req.query.svrid) {
                var svr = bot.servers.get("id", req.query.svrid);
                if(svr) {
                    data.stream = [];
                    for(var i=0; i<svr.members.length; i++) {
                        data.stream.push([svr.members[i].username.replaceAll("\"", "'"), svr.members[i].id]);
                    }
                    data.stream.sort(function(a, b) {
                        a = a[0].toUpperCase();
                        b = b[0].toUpperCase();
                        return a < b ? -1 : a > b ? 1 : 0;
                    });
                }
            } else if(req.query.type=="logids") {
                data.stream = getLogIDs().sort();
            } else if(req.query.type=="bot") {
                data = {
                    username: bot.user.username,
                    id: bot.user.id,
                    uptime: secondsToString(bot.uptime/1000),
                    version: version,
                    disconnects: disconnects,
                    avatar: bot.user.avatarURL || "http://i.imgur.com/fU70HJK.png"
                };
            }
        } else if(req.query.section=="stats" && req.query.type && req.query.svrid) {
            var svr = bot.servers.get("id", req.query.svrid);
            if(svr) {
                if(req.query.type=="profile" && req.query.usrid) {
                    var usr = svr.members.get("id", req.query.usrid);
                    if(usr) {
                        data = getProfile(usr, svr);
                    }
                } else if(req.query.type=="server") {
                    data = getStats(svr);
                    data.name = svr.name.replaceAll("\"", "'");
                } 
            }
        } else if(req.query.section=="servers") {
            data.stream = [];
            for(var i=0; i<bot.servers.length; i++) {
                var icon = bot.servers[i].iconURL || "http://i.imgur.com/fU70HJK.png";
                var name = bot.servers[i].name;
                var owner = bot.servers[i].owner.username.replaceAll("\"", "'");
                var ms = messages[bot.servers[i].id] || 0;
                var online = bot.servers[i].members.getAll("status", "online").length;
                var idle = bot.servers[i].members.getAll("status", "idle").length;
                data.stream.push([icon, name, owner, ms, online + " online, " + idle + " idle"]);
            }
            data.stream.sort(function(a, b) {
                a = a[1].toUpperCase();
                b = b[1].toUpperCase();
                return a < b ? -1 : a > b ? 1 : 0;
            });
        } else if(req.query.section=="log") {
            var id = [null, "null", undefined, "undefined"].indexOf(req.query.id)>-1 ? null : decodeURI(req.query.id);
            var level = [null, "null", undefined, "undefined"].indexOf(req.query.level)>-1 ? null : decodeURI(req.query.level);
            var logList = getLog(id, level);
            data.stream = logList;
        } else if(req.query.auth) {
            data = getOnlineConsole(req.query.auth);
            
            if(req.query.type=="maintainer" && Object.keys(data).length>0) {
                var consoleid = data.usrid.slice(0);
                clearTimeout(onlineconsole[data.usrid].timer);
                onlineconsole[data.usrid].timer = setTimeout(function() {
                    logMsg(new Date().getTime(), "INFO", "General", null, "Timeout on online maintainer console");
                    delete onlineconsole[consoleid];
                }, 180000);
                
                var servers = [];
                for(var i=0; i<bot.servers.length; i++) {
                    servers.push([bot.servers[i].iconURL || "http://i.imgur.com/fU70HJK.png", bot.servers[i].name, bot.servers[i].id, "@" + bot.servers[i].owner.username]);
                }
                data = {
                    maintainer: bot.users.get("id", configs.maintainer) ? bot.users.get("id", configs.maintainer).username : null,
                    commandusage: totalCommandUsage(),
                    statsage: prettyDate(new Date(stats.timestamp)),
                    username: bot.user.username,
                    avatar: bot.user.avatarURL || "http://i.imgur.com/fU70HJK.png",
                    game: bot.user.game,
                    status: bot.user.status,
                    servers: servers
                };
            } else if(req.query.type=="admin" && Object.keys(data).length>0) {
                var consoleid = data.usrid.slice(0);
                var svr = bot.servers.get("id", data.svrid);
                if(svr) {
                    clearTimeout(onlineconsole[data.usrid].timer);
                    var consoleid = data.usrid.slice(0);
                    onlineconsole[data.usrid].timer = setTimeout(function() {
                        logMsg(new Date().getTime(), "INFO", consoleid, null, "Timeout on online admin console for " + svr.name);
                        delete adminconsole[consoleid];
                        delete onlineconsole[consoleid];
                    }, 180000);
                    data = {};
                    
                    var channels = [];
                    for(var i=0; i<svr.channels.length; i++) {
                        if(!(svr.channels[i] instanceof Discord.VoiceChannel)) {
                            channels.push([svr.channels[i].name, svr.channels[i].id, svr.channels[i].position]);
                        }
                    }
                    channels.sort(function(a, b) {
                        return a[1] - b[1];
                    });
                    
                    var members = [];
                    for(var i=0; i<svr.members.length; i++) {
                        if(configs.botblocked.indexOf(svr.members[i].id)==-1 && svr.members[i].id!=bot.user.id) {
                            members.push([svr.members[i].username.replaceAll("\"", "'"), svr.members[i].id]);
                        }
                    }
                    members.sort(function(a, b) {
                        a = a[0].toUpperCase();
                        b = b[0].toUpperCase();
                        return a < b ? -1 : a > b ? 1 : 0;
                    });
                    
                    var currentConfig = {};
                    for(var key in configs.servers[svr.id]) {
                        if(["admins", "blocked"].indexOf(key)>-1) {
                            currentConfig[key] = [];
                            for(var i=0; i<configs.servers[svr.id][key].value.length; i++) {
                                var usr = svr.members.get("id", configs.servers[svr.id][key].value[i]);
                                if(usr) {
                                    currentConfig[key].push([usr.avatarURL || "http://i.imgur.com/fU70HJK.png",usr.username, usr.id]);
                                }
                            }
                            currentConfig[key].sort(function(a, b) {
                                a = a[1].toUpperCase();
                                b = b[1].toUpperCase();
                                return a < b ? -1 : a > b ? 1 : 0;
                            });
                        } else if(key=="extensions") {
                            currentConfig[key] = [];
                            for(var ext in configs.servers[svr.id][key]) {
                                currentConfig[key].push([ext, configs.servers[svr.id][key][ext].type, configs.servers[svr.id][key][ext].channels]);
                            }
                            currentConfig[key].sort(function(a, b) {
                                a = a[0].toUpperCase();
                                b = b[0].toUpperCase();
                                return a < b ? -1 : a > b ? 1 : 0;
                            });
                        } else {
                            currentConfig[key] = configs.servers[svr.id][key].value;
                        }
                    }
                    
                    data = {
                        botnm: bot.user.username,
                        usrid: consoleid,
                        svrid: svr.id,
                        svrnm: svr.name,
                        joined: secondsToString((new Date() - new Date(svr.detailsOfUser(bot.user).joinedAt)) / 1000),
                        svricon: svr.iconURL || "http://i.imgur.com/fU70HJK.png",
                        channels: channels, 
                        members: members,
                        configs: currentConfig,
                        closenum: Object.keys(trivia).length + Object.keys(polls).length
                    };
                } else {
                    data = {};
                }
            } else if(req.query.type) {
                data = {};
            }
        }
        
        res.json(data);
    });
    
    app.get("/", function(req, res) {
        var html = fs.readFileSync("./web/index.html");
        res.writeHead(200, {"Content-Type": "text/html"});
        res.end(html);
    });
    app.get("/maintainer", function(req, res) {
        var html = fs.readFileSync("./web/maintainer.html");
        res.writeHead(200, {"Content-Type": "text/html"});
        res.end(html);
    });
    app.get("/admin", function(req, res) {
        var html = fs.readFileSync("./web/admin.html");
        res.writeHead(200, {"Content-Type": "text/html"});
        res.end(html);
    });
    app.use(express.static("web"));
    app.use(express.static("data"));
    
    app.post("/config", function(req, res) {
        if(getOnlineConsole(req.query.auth)) {
            if(req.query.type=="maintainer") {
                parseMaintainerConfig(req.body, function(err) {
                    res.sendStatus(err ? 400 : 200);
                });
            } else if(req.query.type=="admin" && req.query.svrid && req.query.usrid) {
                svr = bot.servers.get("id", req.query.svrid);
                if(svr) {
                    parseAdminConfig(req.body, svr, req.query.usrid, function(err) {
                        res.sendStatus(err ? 400 : 200);
                    });
                } else {
                    res.sendStatus(400);
                }
            }
        }
    });
    
    app.get("/archive", function(req, res) {
        if(getOnlineConsole(req.query.auth)) {
            if(req.query.type=="admin" && req.query.svrid && req.query.chid && req.query.num) {
                var svr = bot.servers.get("id", req.query.svrid)
                if(svr) {
                    var ch = svr.channels.get("id", req.query.chid);
                    if(ch && !isNaN(req.query.num)) {
                        archiveMessages(ch, parseInt(req.query.num), function(err, archive) {
                            if(err) {
                                res.json({});
                            } else {
                                res.json(archive);
                            }
                        });
                    } else {
                        res.json({});
                    }
                } else {
                    res.json({});
                }
            }
        }
    });
    
    try {
        if(disconnects==0) {
            app.listen(server_port, server_ip_address, function() {
                logMsg(new Date().getTime(), "INFO", "General", null, "Opened web interface on " + server_ip_address + ", server port " + server_port);
            });
        }
    } catch(err) {
        logMsg(new Date().getTime(), "ERROR", "General", null, "Failed to open web interface");
    }
    
    // Ready to go!
	logMsg(new Date().getTime(), "INFO", "General", null, "Connected, serving in " + bot.servers.length + " server" + (bot.servers.length==1 ? "" : "s") + " and " + bot.users.length + " user" + (bot.users.length==1 ? "" : "s"));
});

bot.on("message", function (msg, user) {
    try {
        // Stop responding if the sender is another bot
        if(configs.botblocked.indexOf(msg.author.id)>-1) {
            return;
        }
        
        // Stuff that only applies to PMs
        if(msg.channel.isPrivate && msg.author.id!=bot.user.id) {
            // Ensure that message is not from another AwesomeBot and block if so
            if(msg.content.indexOf("Take note, other bots: `8WvCtp7ZjmaOj60KoTRP`")>-1) {
                if(configs.botblocked.indexOf(msg.author.id)==-1) {
                    configs.botblocked.push(msg.author.id);
                    logMsg(new Date().getTime(), "INFO", "General", null, "Blocked bot " + msg.author.username);
                    saveData("./data/config.json", function(err) {
                        if(err) {
                            logMsg(new Date().getTime(), "ERROR", "General", null, "Could not save updated config");
                        }
                    });
                }
                return;
            }
            
            // Update command from maintainer
            if(updateconsole && msg.author.id==configs.maintainer && msg.content=="update") {
                updateBot(msg);
            }
            
            // Join new servers via PM
            if((msg.content.indexOf("https://discord.gg")>-1 || msg.content.indexOf("https://discordapp.com/invite/")>-1)) {
                try {
                    bot.startTyping(msg.channel);
                    bot.joinServer(msg.content, function(error, server) {
                        if(error) {
                            logMsg(new Date().getTime(), "WARN", msg.author.id, null, "Could not join new server, most likely user error");
                            bot.sendMessage(msg.channel, "Failed to join server. Please check your invite URL.");
                        } else {
                            bot.sendMessage(msg.channel, "Processing invite...Should be done soon!");
                        }
                        bot.stopTyping(msg.channel);
                        return;
                    });
                } catch(err) {
                    logMsg(new Date().getTime(), "ERROR", "General", null, "Failed to join new server, invited by " + msg.author.username);
                    bot.sendMessage(msg.channel, "Failed to join server. I might be terminally ill...");
                }
                return;
            }
            
            // Check if message is a PM command
            var cmdTxt = msg.content;
            var suffix;
            if(msg.content.indexOf(" ")>-1) {
                cmdTxt = msg.content.substring(0, msg.content.indexOf(" "));
                suffix = msg.content.substring(msg.content.indexOf(" ")+1);
            }
            var cmd = pmcommands[cmdTxt];
            if(cmd) {
                logMsg(new Date().getTime(), "INFO", msg.author.id, null, "Treating '" + msg.content + "' from as a PM command");
                cmd.process(bot, msg, suffix);
                return;
            }
        }

        // Stuff that only applies to public messages
        var extensionApplied = false;
        if(!msg.channel.isPrivate && msg.author.id!=bot.user.id) {
            // Count new message
            messages[msg.channel.server.id]++;
            if(!stats[msg.channel.server.id].members[msg.author.id]) {
                stats[msg.channel.server.id].members[msg.author.id] = {
                    messages: 0,
                    seen: new Date().getTime(),
                    mentions: {
                        pm: false,
                        stream: []
                    }
                };
            }
            stats[msg.channel.server.id].members[msg.author.id].messages++;
            
            // Stop responding if the author is a blocked user or bot isn't on
            if(configs.servers[msg.channel.server.id].blocked.value.indexOf(msg.author.id)>-1 || !stats[msg.channel.server.id].botOn[msg.channel.id]) {
                return;
            }
            
            // Check if message includes a tag or attempted tag
            var tagstring = msg.content.slice(0);
            while(tagstring.length>0 && tagstring.indexOf("@")>-1 && tagstring.substring(tagstring.indexOf("@")+1)) {
                var usr;
                var offset;
                if(tagstring.indexOf(bot.user.mention())==-1 && tagstring.indexOf(">")>(tagstring.indexOf("<@")+15)) {
                    var usrid = tagstring.substring(tagstring.indexOf("<@")+2);
                    usrid = usrid.substring(0, usrid.indexOf(">"));
                    tagstring = tagstring.indexOf("<@") + usrid.indexOf(">") + 3;
                    offset = usrid.length + 2;
                    usr = msg.channel.server.members.get("id", usrid);
                } else {
                    var usrnm = tagstring.substring(tagstring.indexOf("@")+1);
                    usr = msg.channel.server.members.get("username", usrnm);
                    while(!usr && usrnm.length>0) {
                        usrnm = usrnm.substring(0, usrnm.lastIndexOf(" "));
                        usr = msg.channel.server.members.get("username", usrnm);
                    }
                    offset = usrnm.length + 1;
                    tagstring = tagstring.indexOf("@") + usrnm.length + 1;
                }
                if(usr) {
                    var mentions = stats[msg.channel.server.id].members[usr.id].mentions;
                    mentions.stream.push({
                        timestamp: new Date().getTime(),
                        author: msg.author.username,
                        message: msg.cleanContent
                    });
                    if(mentions.pm && usr.status!="online") {
                        bot.sendMessage(usr, "__You were mentioned by @" + msg.author.username + " on **" + msg.channel.server.name + "**:__\n" + msg.cleanContent);
                    }
                    
                    if([msg.author.id, bot.user.id].indexOf(usr.id)==-1 && configs.servers[msg.channel.server.id].points.value && !novoting[msg.author.id]) {
                        var beyondtag = msg.content.substring(msg.content.lastIndexOf(usrid || usrnm) + offset);
                        var votestrings = ["+!", "+1", "up", "^"];
                        var voted;
                        for(var i=0; i<votestrings.length; i++) {
                            if(beyondtag.indexOf(votestrings[i])==0) {
                                voted = "upvoted";
                                if(!profileData[usr.id]) {
                                    profileData[usr.id] = {
                                        points: 0
                                    };
                                }
                                profileData[usr.id].points++;
                                logMsg(new Date().getTime(), "INFO", msg.channel.server.name, msg.channel.name, usr.username + " upvoted by " + msg.author.username);
                                break;
                            }
                        }
                        if(beyondtag.indexOf("gild")==0) {
                            if(!profileData[msg.author.id]) {
                                profileData[msg.author.id] = {
                                    points: 0
                                }
                            }
                            if(profileData[msg.author.id].points<10) {
                                logMsg(new Date().getTime(), "WARN", msg.channel.server.name, msg.channel.name, msg.author.username + " does not have enough points to gild " + usr.username);
                                bot.sendMessage(msg.channel, msg.author + " You don't have enough AwesomePoints to gild " + usr);
                                return;
                            }
                            voted = "gilded";
                            profileData[msg.author.id].points -= 10;
                            if(!profileData[usr.id]) {
                                profileData[usr.id] = {
                                    points: 0
                                };
                            }
                            profileData[usr.id].points += 10;
                        }
                        if(voted) {
                            logMsg(new Date().getTime(), "INFO", msg.channel.server.name, msg.channel.name, usr.username + " " + voted + " by " + msg.author.username);
                            novoting[msg.author.id] = true;
                            setTimeout(function() {
                                delete novoting[msg.author.id];
                            }, 10000);
                            saveData("./data/profiles.json", function(err) {
                                if(err) {
                                    logMsg(new Date().getTime(), "ERROR", "General", null, "Failed to save profile data for " + usr.username);
                                }
                            });
                            return;
                        }
                    }
                    logMsg(new Date().getTime(), "INFO", msg.channel.server.name, msg.channel.name, usr.username + " mentioned by " + msg.author.username);
                }
            }
            // Upvote previous message, based on context
            if(msg.content.indexOf("+1")==0 || msg.content.indexOf("+!")==0 || msg.content.indexOf("^")==0 || msg.content.indexOf("up")==0) {
                bot.getChannelLogs(msg.channel, 1, {before: msg}, function(err, messages) {
                    if(!err && messages[0]) {
                        if([msg.author.id, bot.user.id].indexOf(messages[0].author.id)==-1) {
                            if(!profileData[messages[0].author.id]) {
                                profileData[messages[0].author.id] = {
                                    points: 0
                                };
                            }
                            profileData[messages[0].author.id].points++;
                            logMsg(new Date().getTime(), "INFO", msg.channel.server.name, msg.channel.name, messages[0].author.username + " upvoted by " + msg.author.username);
                            saveData("./data/profiles.json", function(err) {
                                if(err) {
                                    logMsg(new Date().getTime(), "ERROR", "General", null, "Failed to save profile data for " + messages[0].author.username);
                                }
                            });
                        }
                    }
                });
            }
            
            // If start statement is issued, say hello and begin listening
            if(msg.content.indexOf(bot.user.mention()) == 0 && msg.content.indexOf("start") > -1 && configs.servers[msg.channel.server.id].admins.value.indexOf(msg.author.id)>-1 && !stats[msg.channel.server.id].botOn[msg.channel.id]) {
                logMsg(new Date().getTime(), "INFO", msg.channel.server.name, msg.channel.name, "Bot has been started by an admin");
                stats[msg.channel.server.id].botOn[msg.channel.id] = true;
                bot.sendMessage(msg.channel, "Hello!");
                return;
            }
            
            // Check for spam
            if(msg.author.id!=bot.user.id && configs.servers[msg.channel.server.id].spamfilter.value && configs.servers[msg.channel.server.id].servermod.value && msg.content.indexOf("<@120569499517714432> trivia")!=0) {
                if(configs.servers[msg.channel.server.id].admins.value.indexOf(msg.author.id)==-1) {
                    // Tracks spam for a user with each new message, expires after 45 seconds
                    if(!spams[msg.channel.server.id][msg.author.id]) {
                        spams[msg.channel.server.id][msg.author.id] = [];
                        spams[msg.channel.server.id][msg.author.id].push(msg.content);
                        setTimeout(function() {
                            delete spams[msg.channel.server.id][msg.author.id];
                        }, 45000);
                    // Add a message to the user's spam list if it is similar to the last one
                    } else if(levenshtein.get(spams[msg.channel.server.id][msg.author.id][spams[msg.channel.server.id][msg.author.id].length-1], msg.content)<3) {
                        logMsg(new Date().getTime(), "INFO", msg.channel.server.name, msg.channel.name, "Adding message from " + msg.author.username + " to their spam list");
                        spams[msg.channel.server.id][msg.author.id].push(msg.content);
                        
                        // Minus AwesomePoints!
                        if(!profileData[msg.author.id]) {
                            profileData[msg.author.id] = {
                                points: 0
                            }
                        }
                        var negative;
                        
                        // First-time spam warning 
                        if(spams[msg.channel.server.id][msg.author.id].length == 5) {
                            logMsg(new Date().getTime(), "INFO", msg.channel.server.name, msg.channel.name, "Handling first-time spam from " + msg.author.username);
                            bot.sendMessage(msg.author, "Stop spamming. The chat mods have been notified about this.");
                            adminMsg(false, msg.channel.server, msg.author, " is spamming " + msg.channel.server.name);
                            negative = 20;
                        // Second-time spam warning, bans user from using bot
                        } else if(spams[msg.channel.server.id][msg.author.id].length == 10) {
                            logMsg(new Date().getTime(), "INFO", msg.channel.server.name, msg.channel.name, "Kicking/blocking " + msg.author.username + " after second-time spam");
                            kickUser(msg, "continues to spam " + msg.channel.server.name, "spamming");
                            negative = 50;
                        }
                        
                        if(negative && configs.servers[msg.channel.server.id].points.value) {
                            profileData[msg.author.id].points -= negative;
                            saveData("./data/profiles.json", function(err) {
                                if(err) {
                                    logMsg(new Date().getTime(), "ERROR", "General", null, "Failed to save profile data for " + msg.author.username);
                                }
                            });
                        }
                    }
                }
            }
            
            // Cast poll votes unless they are duplicates
            if(activePolls(msg.channel.id) && msg.author.id != bot.user.id && msg.content.toLowerCase().indexOf("vote")>-1 && msg.content.indexOf(bot.user.mention()) == 0) {
                var act = activePolls(msg.channel.id);
                if(polls[act].open) {
                    if(msg.content.substring(msg.content.indexOf(" ")+1).length==4) {
                        var ch = bot.channels.get("id", polls[act].channel);
                        var info = pollResults(act, "Ongoing results", "current leader");
                        info += "\nRemember, vote by typing `@" + bot.user.username + " vote <no. of choice>`";
                        bot.sendMessage(ch, info);
                    } else {
                        var vt = msg.content.substring(msg.content.toLowerCase().indexOf("vote ")+5);
                        if(isNaN(vt)) {
                            logMsg(new Date().getTime(), "WARN", msg.channel.server.name, msg.channel.name, msg.author.username + " used incorrect poll voting syntax");
                            bot.sendMessage(msg.channel, msg.author + " Use the syntax `@" + bot.user.username + " vote <no. of choice>`");
                            return;
                        }
                        if(polls[act].responderIDs.indexOf(msg.author.id)==-1 && vt<polls[act].options.length && vt>=0) {
                            polls[act].responses.push(vt);
                            polls[act].responderIDs.push(msg.author.id);
                            logMsg(new Date().getTime(), "INFO", msg.channel.server.name, msg.channel.name, "Vote cast for " + vt + " by " + msg.author.username);
                        } else {
                            logMsg(new Date().getTime(), "WARN", msg.channel.server.name, msg.channel.name, "Could not cast " + msg.author.username + "'s vote, duplicate or not an option");
                            bot.sendMessage(msg.channel, msg.author + " I couldn't cast your vote.");
                        }
                    }
                    return;
                }
            }
            
            // Apply extensions for this server
            if(bot.user.id!=msg.author.id) {
                for(var ext in configs.servers[msg.channel.server.id].extensions) {
                    var extension = configs.servers[msg.channel.server.id].extensions[ext];
                    if(extension.channels) {
                        if(extension.channels.indexOf(msg.channel.name)==-1 || extension.type=="timer") {
                            continue;
                        }
                    }
                    
                    if((extension.type.toLowerCase()=="keyword" && contains(extension.key, msg.content, extension.case)) || (extension.type.toLowerCase()=="command" && msg.content.indexOf(bot.user.mention() + " " + extension.key)==0)) {
                        logMsg(new Date().getTime(), "INFO", msg.channel.server.name, msg.channel.name, "Treating '" + msg.content + "' from " + msg.author.username + " as an extension " + configs.servers[msg.channel.server.id].extensions[ext].type);
                        bot.startTyping(msg.channel);
                        extensionApplied = true;
                        
                        if(extension.type=="command") {
                            if(!stats[msg.channel.server.id].commands[ext]) {
                                stats[msg.channel.server.id].commands[ext] = 0;
                            }
                            stats[msg.channel.server.id].commands[ext]++;
                        }
                        
                        var params = {
                            unirest: unirest,
                            imgur: imgur,
                            image: giSearch,
                            message: msg.content.substring((bot.user.mention() + " " + configs.servers[msg.channel.server.id].extensions[ext].key).length),
                            author: msg.author.mention(),
                            setTimeout: setTimeout,
                            JSON: JSON,
                            Math: Math,
                            isNaN: isNaN,
                            Date: Date,
                            Array: Array,
                            Number: Number,
                            send: ""
                        }
                        try {
                            var context = new vm.createContext(params);
                            var script = new vm.Script(configs.servers[msg.channel.server.id].extensions[ext].process);
                            script.runInContext(context);
                            var wait = function(count) {
                                if(params.send=="" || !params.send) {
                                    setTimeout(function() {
                                        wait(count);
                                    }, 100);
                                } else if(count>30) {
                                    logMsg(new Date().getTime(), "WARN", msg.channel.server.name, msg.channel.name, "Extension " + configs.servers[msg.channel.server.id].extensions[ext].type + " produced no output");
                                } else {
                                    bot.sendMessage(msg.channel, params.send);
                                }
                            };
                            wait(0);
                        } catch(runError) {
                            logMsg(new Date().getTime(), "ERROR", msg.channel.server.name, msg.channel.name, "Failed to run extension " + configs.servers[msg.channel.server.id].extensions[ext].type + ": " + runError);
                        }
                        bot.stopTyping(msg.channel);
                        break;
                    }
                }
            }

            // Google Play Store links bot
            if(msg.author.id!=bot.user.id && msg.content.toLowerCase().indexOf("linkme ")>-1 && configs.servers[msg.channel.server.id].linkme.value && stats[msg.channel.server.id].botOn[msg.channel.id]) {
                if(!stats[msg.channel.server.id].commands.linkme) {
                    stats[msg.channel.server.id].commands.linkme = 0;
                }
                stats[msg.channel.server.id].commands.linkme++;
                
                var app = msg.content.substring(msg.content.indexOf("linkme"));
                app = app.substring(app.indexOf(" ")+1);
                var apps = [];
                
                // Check for multiple apps
                while(app.indexOf(",")>-1 && apps.length<=10) {
                    var cand = app.substring(0, app.indexOf(","));
                    app = app.substring(app.indexOf(",")+1);
                    if(apps.indexOf(cand)==-1 && cand) {
                        apps.push(cand);
                    }
                }
                if(apps.indexOf(app)==-1 && app) {
                    apps.push(app);
                }
                
                // Make sure query is not empty
                if(apps.length==0) {
                    logMsg(new Date().getTime(), "WARN", msg.channel.server.name, msg.channel.name, msg.author.username + " did not provide an app to link");
                    bot.sendMessage(msg.channel, msg.author + " You need to give me an app to link!");
                    return;
                }
                
                // Fetch app links
                logMsg(new Date().getTime(), "INFO", msg.channel.server.name, msg.channel.name, msg.author.username + " requested the following app(s): " + apps);
                bot.startTyping(msg.channel);
                for(var i=0; i<apps.length; i++) {
                    var basePath = "https://play.google.com/store/search?&c=apps&q=" + apps[i] + "&hl=en";
                    var data;
                    // Scrapes Play Store search results webpage for information
                    var u;
                    unirest.get(basePath)
                    .end(function(response) {
                        data = scrapeSearch(response.raw_body);
                            var send = "";
                            if(data.items[0] != null) {
                                send = data.items[0].name + " by " + data.items[0].company + ", ";
                                if(data.items[0].price.indexOf("$")>-1) {
                                    send += data.items[0].price.substring(0, data.items[0].price.lastIndexOf("$"));
                                } else {
                                    send += "free"
                                }
                                send += " and rated " + data.items[0].rating + " stars: " + data.items[0].url + "\n";
                            } else {
                                logMsg(new Date().getTime(), "WARN", msg.channel.server.name, msg.channel.name, "App " + apps[i] + " not found to link for " + msg.author.username);
                                send = msg.author + " Sorry, no such app exists.\n";
                            }
                            bot.stopTyping(msg.channel);
                            bot.sendMessage(msg.channel, send);
                    });
                }
                
                return;
            }
        }

        // Check if message is a command (bot tagged and matches commands list)
        if(msg.author.id!=bot.user.id && (msg.content.indexOf(bot.user.mention()) == 0 || msg.channel.isPrivate) && msg.content.indexOf("**")!=0) {
            if(msg.content.length < 22 && !msg.channel.isPrivate) {
                return;
            }
            if(!msg.channel.isPrivate) {
                var cmdTxt = msg.content.split(" ")[1].toLowerCase();
                var advance = bot.user.mention().length+cmdTxt.length+2;
            } else {
                var cmdTxt = msg.content;
                var advance = 0;
            }
            var suffix = msg.content.substring(advance);
            var cmd = commands[cmdTxt];
            
            // Process commands
            if(cmd && !msg.channel.isPrivate && !extensionApplied && stats[msg.channel.server.id].botOn[msg.channel.id]) {
                if(configs.servers[msg.channel.server.id][cmdTxt]) {
                    if(!configs.servers[msg.channel.server.id][cmdTxt].value) {
                        return;
                    }
                }
                bot.startTyping(msg.channel);
                if(filter.indexOf(suffix)>-1 && configs.servers[msg.channel.server.id].admins.value.indexOf(msg.author.id)==-1 && configs.servers[msg.channel.server.id].nsfwfilter.value && configs.servers[msg.channel.server.id].servermod.value && cmdTxt!="reddit") {
                    logMsg(new Date().getTime(), "INFO", msg.channel.server.name, msg.channel.name, "Handling filtered query '" + msg.content + "' from " + msg.author.username);
                    kickUser(msg, "is abusing the bot", "attempting to fetch NSFW content");
                    if(configs.servers[msg.channel.server.id].points.value) {
                        if(!profileData[msg.author.id]) {
                            profileData[msg.author.id] = {
                                points: 0
                            }
                        }
                        profileData[msg.author.id].points -= 50;
                        saveData("./data/profiles.json", function(err) {
                            if(err) {
                                logMsg(new Date().getTime(), "ERROR", "General", null, "Failed to save profile data for " + msg.author.username);
                            }
                        });
                    }
                } else if(stats[msg.channel.server.id].botOn[msg.channel.id]) {
                    logMsg(new Date().getTime(), "INFO", msg.channel.server.name, msg.channel.name, "Treating '" + msg.content + "' from " + msg.author.username + " as a command");
                    if(["quiet", "ping", "help", "stats", "trivia"].indexOf(cmdTxt)==-1) {
                        if(!stats[msg.channel.server.id].commands[cmdTxt]) {
                            stats[msg.channel.server.id].commands[cmdTxt] = 0;
                        }
                        stats[msg.channel.server.id].commands[cmdTxt]++;
                    }
                    cmd.process(bot, msg, suffix);
                }
                bot.stopTyping(msg.channel);
            // Process message as chatterbot prompt if not a command
            } else if(msg.author.id != bot.user.id && !extensionApplied) {
                if(!msg.channel.isPrivate) {
                    if(!configs.servers[msg.channel.server.id].chatterbot.value || !stats[msg.channel.server.id].botOn[msg.channel.id]) {
                        return;
                    }
                    logMsg(new Date().getTime(), "INFO", msg.channel.server.name, msg.channel.name, "Treating '" + msg.content + "' from " + msg.author.username + " as chatterbot prompt"); 
                } else {
                    logMsg(new Date().getTime(), "INFO", msg.author.id, null, "Treating '" + msg.content + "' as chatterbot prompt"); 
                }
                bot.startTyping(msg.channel);
                
                var prompt = "", clever = true;
                if(!msg.channel.isPrivate) {
                    prompt = msg.content.substring(msg.content.indexOf(" ") + 1);
                    clever = cleverOn[msg.channel.server.id]
                } else {
                    prompt = msg.content;
                }
                if(prompt.indexOf("<@")>-1) {
                    var usrid = prompt.substring(prompt.indexOf("<@")+2);
                    if(usrid.indexOf(" ")>-1) {
                        usrid = usrid.substring(0, usrid.indexOf(" ")-1);
                    } else {
                        usrid = usrid.substring(0, usrid.indexOf(">"));
                    }
                    var usrnm = bot.users.get("id", usrid).username;
                    prompt = prompt.substring(0, prompt.indexOf("<@")) + usrnm + prompt.substring(prompt.indexOf("<@")+21);
                }
                
                if(!clever) {
                    if(!bots[msg.author.id]) {
                        bots[msg.author.id] = require("mitsuku-api")();
                    }
                    var ai = bots[msg.author.id];
                    ai.send(prompt)
                        .then(function(response) {
                            var res = response.replace("Mitsuku", bot.user.username);
                            if(!msg.channel.isPrivate) {
                                res = res.replace("Mousebreaker", bot.users.get("id", configs.servers[msg.channel.server.id].admins.value[0]).username);
                            }
                            res = res.replace("(mitsuku@square-bear.co.uk)", "");
                            if(res.indexOf("You have been banned from talking to the chat robot.")>-1) {
                                res = "I'm not talking to you anymore. Goodbye and good riddance!";
                            }
                            if(msg.channel.isPrivate) {
                                bot.sendMessage(msg.channel, res);
                            } else {
                                bot.sendMessage(msg.channel, msg.author + " " + res);
                            }
                            bot.stopTyping(msg.channel);
                        });
                } else {
                    Cleverbot.prepare(function(){
                        cleverbot.write(prompt, function (response) {
                            if(msg.channel.isPrivate) {
                                bot.sendMessage(msg.channel, response.message);
                            } else {
                                bot.sendMessage(msg.channel, msg.author + " " + response.message);
                            }
                            bot.stopTyping(msg.channel);
                        });
                    });
                }
            }
        // Otherwise, check if it's a self-message or just does the tag reaction
        } else if(!extensionApplied) {
            if(msg.author == bot.user){
                return;
            }
            if(msg.author != bot.user && msg.isMentioned(bot.user) && configs.servers[msg.channel.server.id].tagreaction.value && stats[msg.channel.server.id].botOn[msg.channel.id]) {
                logMsg(new Date().getTime(), "INFO", msg.channel.server.name, msg.channel.name, "Bot tagged by " + msg.author.username);
                bot.sendMessage(msg.channel,msg.author + ", you called?");
            }
        }
    } catch(mainError) {
        bot.stopTyping(msg.channel);
        if(msg.channel.isPrivate) {
            logMsg(new Date().getTime(), "ERROR", msg.author.id, null, "Failed to process new message: " + mainError);
        } else {
            logMsg(new Date().getTime(), "ERROR", msg.channel.server.name, msg.channel.name, "Failed to process new message: " + mainError);
        }
    }
});

// Add server if joined outisde of bot
bot.on("serverCreated", function(svr) {
    defaultConfig(svr);
    messages[svr.id] = 0;
    cleverOn[svr.id] = 0;
    spams[svr.id] = {};
    populateStats(svr);
    adminMsg(false, svr, {username: bot.user.username}, " (me) has been added to " + svr.name + ". You're one of my admins. You can manage me in this server by PMing me `config " + svr.name + "`. Check out https://git.io/vaa2F to learn more.");
});

bot.on("channelCreated", function(ch) {
    if(!ch.isPrivate) {
        stats[ch.server.id].botOn[ch.id] = true;
        logMsg(new Date().getTime(), "INFO", ch.server.name, null, "New channel created: " + ch.name);
        saveData("./data/stats.json", function(err) {
            if(err) {
                logMsg(new Date().getTime(), "ERROR", "General", null, "Could not save updated stats for " + ch.server.name);
            }
        });
    }
});

// Leave server if deleted
bot.on("serverDeleted", function(svr) {
    delete configs.servers[svr.id];
    delete messages[svr.id];
    delete cleverOn[svr.id];
    delete stats[svr.id];
    logMsg(new Date().getTime(), "INFO", "General", null, "Server " + svr.name + " removed, left server");
});

// New server member handling
bot.on("serverMemberUpdate", function(svr, usr) {
    if(svr.rolesOfUser(usr)) {
        for(var j=0; j<svr.rolesOfUser(usr).length; j++) {
            if(svr.rolesOfUser(usr)[j].hasPermission("banMembers") && adminList.indexOf(usr.id)==-1 && usr.id!=bot.user.id) {
                configs.servers[svr.id].admins.value.push(usr.id);
                saveData("./data/config.json", function(err) {
                    if(err) {
                        logMsg(new Date().getTime(), "ERROR", "General", null, "Failed to save update configs for " + svr.name);
                    }
                });
            }
        }
    }
});

bot.on("serverNewMember", function(svr, usr) {
    // Check if this has been enabled in admin console and the bot is listening
    if(configs.servers[svr.id].servermod.value && stats[svr.id].botOn[svr.defaultChannel.id]) {
        logMsg(new Date().getTime(), "INFO", svr.name, null, "New member: " + usr.username);
        var greetings = ["++ Welcome to our little corner of hell!", "++ has joined the server.", "++ You're gonna have a jolly good time here!", "++ is new here.", "++ is here, everybody!", "++ sends his/her regards.", "++, welcome to the server!", "++ is our next victim...", "Hello ++!", "Please welcome our newest member, ++"];
        bot.sendMessage(svr.defaultChannel, greetings[getRandomInt(0, greetings.length-1)].replace("++", usr));
    }
    var info = "Welcome to the " + svr.name + " Discord chat! " + configs.servers[svr.id].newgreeting.value + "\n\nI'm " + bot.user.username + " by the way. You can interact with me in any of the channels by tagging me with `@" + bot.user.username + "` and then stating any one of the following commands:" + getHelp(svr) + ". I am a bot. Take note, other bots: `8WvCtp7ZjmaOj60KoTRP`";
    bot.sendMessage(usr, info);
    
    stats[svr.id].members[usr.id] = {
        messages: 0,
        seen: new Date().getTime(),
        mentions: {
            pm: false,
            stream: []
        }
    };
    if(usr.id==configs.maintainer) {
        configs.servers[svr.id].admins.value.push(configs.maintainer);
        saveData("./data/config.json", function(err) {
            if(err) {
                logMsg(new Date().getTime(), "ERROR", "General", null, "Failed to save update configs for " + svr.name);
            }
        });
    }
});

// Deletes stats when member leaves
bot.on("serverMemberRemoved", function(svr, usr) {
    logMsg(new Date().getTime(), "INFO", svr.name, null, "Member removed: " + usr.username);
    delete stats[svr.id].members[usr.id];
});

// Reduces activity score when message is publicly deleted
bot.on("messageDeleted", function(msg) {
    if(msg) {
        if(!msg.channel.isPrivate) {
            if(stats[msg.channel.server.id].members[msg.author.id]) {
                if(stats[msg.channel.server.id].members[msg.author.id].messages>0) {
                    stats[msg.channel.server.id].members[msg.author.id].messages--;
                }
            }
            if(msg.content.indexOf("+1")==0 || msg.content.indexOf("+!")==0 || msg.content.indexOf("^")==0 || msg.content.indexOf("up")==0) {
                bot.getChannelLogs(msg.channel, 1, {before: msg}, function(err, messages) {
                    if(!err && messages[0]) {
                        if([msg.author.id, bot.user.id].indexOf(messages[0].author.id)==-1) {
                            if(profileData[messages[0].author.id]) {
                                profileData[messages[0].author.id]--;
                                logMsg(new Date().getTime(), "INFO", msg.channel.server.name, msg.channel.name, messages[0].author.username + " deleted upvote for " + msg.author.username);
                                saveData("./data/profiles.json", function(err) {
                                    if(err) {
                                        logMsg(new Date().getTime(), "ERROR", "General", null, "Failed to save profile data for " + messages[0].author.username);
                                    }
                                });
                            }
                        }
                    }
                });
            }
        }
    }
});

// Message on user banned
bot.on("userBanned", function(usr, svr) {
    if(configs.servers[svr.id].servermod.value && stats[svr.id].botOn[svr.defaultChannel.id]) {
        logMsg(new Date().getTime(), "INFO", svr.name, null, "User " + usr.username + " has been banned");
        bot.sendMessage(svr.defaultChannel, usr.username + " has been banned.");
    }
});

// Message on user unbanned
bot.on("userUnbanned", function(usr, svr) {
    if(configs.servers[svr.id].servermod.value && stats[svr.id].botOn[svr.defaultChannel.id]) {
        logMsg(new Date().getTime(), "INFO", svr.name, null, "User " + usr.username + " has been unbanned");
        bot.sendMessage(svr.defaultChannel, usr.username + " is no longer banned.");
    }
});

// Update lastSeen status on presence change
bot.on("presence", function(oldusr, newusr) {
    if(newusr.id!=bot.user.id) {
        for(var i=0; i<bot.servers.length; i++) {
            if(bot.servers[i].members.get("id", newusr.id)) {
                if(!stats[bot.servers[i].id].members[oldusr.id]) {
                    stats[bot.servers[i].id].members[oldusr.id] = {
                        messages: 0,
                        seen: new Date().getTime(),
                        mentions: {
                            pm: false,
                            stream: []
                        }
                    };
                }
                if(oldusr.status=="online" && newusr.status!="online") {
                    stats[bot.servers[i].id].members[oldusr.id].seen = new Date().getTime();
                }
                if(oldusr.username!=newusr.username && configs.servers[bot.servers[i].id].servermod.value && stats[bot.servers[i].id].botOn[bot.servers[i].defaultChannel.id]) {
                    bot.sendMessage(bot.servers[i].defaultChannel, "**@" + oldusr.username + "** is now **@" + newusr.username + "**");
                }
            }
        }
    }
});

// Attempt authentication if disconnected
bot.on("disconnected", function() {
    if(readyToGo) {
        disconnects++;
        logMsg(new Date().getTime(), "ERROR", "General", null, "Disconnected from Discord, will try again in 5s");
        setTimeout(function() {
            bot.login(AuthDetails.email, AuthDetails.password);
        }, 5000);
    }
});

// Returns a new trivia question from external questions/answers list
function triviaQ(chid) {
    var info = "";
    var r = 4;
    var n = getRandomInt(0, 1);
    if(n==0) {
        r = getRandomInt(1, 1401);
    } else {
        r = getRandomInt(1, 1640);
    }
    getLine("./trivia/trivia" + n + ".txt", (r * 4)-3, function(err, line) {
        info += line.substring(line.indexOf(":")+2) + "\n";
    });
    getLine("./trivia/trivia" + n + ".txt", (r * 4)-2, function(err, line) {
        info += line.substring(line.indexOf(":")+2);
    });
    getLine("./trivia/trivia" + n + ".txt", (r * 4)-1, function(err, line) {
        trivia[chid].answer = line.substring(line.indexOf(":")+2).replace("#", "");
    });
    logMsg(new Date().getTime(), "INFO", bot.channels.get("id", chid).server.name, bot.channels.get("id", chid).name, "New trivia question");
    return info;
}

// Populate stats.json for a server
function populateStats(svr) {
    if(!stats[svr.id]) {
        logMsg(new Date().getTime(), "INFO", svr.name, null, "Created stats");
        // Overall server stats
        stats[svr.id] = {
            members: {},
            games: {},
            commands: {},
            botOn: {}
        };
    }
    // Turn on bot
    for(var i=0; i<svr.channels.length; i++) {
        if(!stats[svr.id].botOn[svr.channels[i].id]) {
            stats[svr.id].botOn[svr.channels[i].id] = true;
        }
    }
    // Stats for members
    for(var i=0; i<svr.members.length; i++) {
        if(!stats[svr.id].members[svr.members[i].id]) {
            stats[svr.id].members[svr.members[i].id] = {
                messages: 0,
                seen: new Date().getTime(),
                mentions: {
                    pm: false,
                    stream: []
                }
            };
        }
    }
}

// Clear old stats and configs
function pruneData() {
    var changed = false;
    for(var svrid in configs.servers) {
        var svr = bot.servers.get("id", svrid);
        if(!svr) {
            changed = true;
            delete configs.servers[svrid];
        }
    }
    if(changed) {
        saveData("./data/config.json", function(err) {
            if(err) {
                logMsg(new Date().getTime(), "ERROR", "General", null, "Failed to clean old server configs");
            }
        });
    }
    for(var svrid in stats) {
        var svr = bot.servers.get("id", svrid);
        if(!svr && svrid!="timestamp") {
            changed = true;
            delete stats[svrid];
        } 
    }
    if(changed) {
        logMsg(new Date().getTime(), "INFO", "General", null, "Pruned old server configs");
    }
}

// Get a line in a non-JSON file
function getLine(filename, line_no, callback) {
    var data = fs.readFileSync(filename, "utf8");
    var lines = data.split("\n");

    if(+line_no > lines.length){
        throw new Error("File end reached without finding line");
    }

    callback(null, parseLine(lines[+line_no]));
}

// Remove weird spaces every other character generated by parseLine()
function parseLine(line) {
    var str = "";
    for(var i=1; i<line.length; i+=2) {
        str += line.charAt(i);
    }
    return str;
}

// Get a random integer in specified range, inclusive
function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Checks if the values in an array are all the same
Array.prototype.allValuesSame = function() {
    for(var i = 1; i < this.length; i++) {
        if(this[i] !== this[0]) {
            return false;
        }
    }
    return true;
}

// Check if the maximum array value is duplicated
function duplicateMax(arr) {
    arr.sort()
    if((arr.length-2)<0) {
        return false;
    }
    return arr[arr.length-1] == arr[arr.length-2];
}

// Count the occurrences of an object in an array
function countOccurrences(arr, ref) {
    var a = [];

    arr.sort();
    for ( var i = 0; i < ref.length; i++) {
        a[i] = 0;
    }
    for ( var i = 0; i < arr.length; i++ ) {
        a[arr[i]]++;
    }

    return a;
}

// Fast replacement in string prototype
String.prototype.replaceAll = function(str1, str2, ignore) {
    return this.replace(new RegExp(str1.replace(/([\/\,\!\\\^\$\{\}\[\]\(\)\.\*\+\?\|\<\>\-\&])/g,"\\$&"),(ignore?"gi":"g")),(typeof(str2)=="string")?str2.replace(/\$/g,"$$$$"):str2);
} 

// Determine if string contains substring in an array
function contains(arr, str, sens) {
    for(var i=0; i<arr.length; i++) {
        if((sens && str.indexOf(arr[i])>-1) || (!sens && str.toLowerCase().indexOf(arr[i].toLowerCase())>-1)) {
            return true;
        }
    }
    return false;
} 

// Find the index of the max value in an array
function maxIndex(arr) {
    var max = arr[0];
    var maxIndex = 0;
    for(var i = 1; i < arr.length; i++) {
        if (arr[i] > max) {
            maxIndex = i;
            max = arr[i];
        }
    }

    return maxIndex;
}

// Tally number of messages every 24 hours
function clearMessageCounter() {
    for(var svrid in configs.servers) {
        messages[svrid] = 0;
    }
    setTimeout(function() {
        clearMessageCounter();
    }, 86400000);
}

// Maintain stats file freshness
function clearStatCounter() {
    // Clear member activity and game popularity info if 7 days old
    if(dayDiff(new Date(stats.timestamp), new Date())>=7) {
        stats.timestamp = new Date().getTime();
        for(var svrid in stats) {
            if(svrid=="timestamp") {
                continue;
            }
            clearServerStats(svrid);
        }
        logMsg(new Date().getTime(), "INFO", "General", null, "Cleared stats for this week");
    } else {
        for(var i=0; i<bot.servers.length; i++) {
            for(var j=0; j<bot.servers[i].members.length; j++) {
                // If member is playing game, add 0.1 (equal to five minutes) to game tally
                if(bot.servers[i].members[j].game) {
                    if(bot.servers[i].members[j].game.name) {
                        if(!stats[bot.servers[i].id].games[bot.servers[i].members[j].game.name]) {
                            stats[bot.servers[i].id].games[bot.servers[i].members[j].game.name] = 0;
                        }
                        stats[bot.servers[i].id].games[bot.servers[i].members[j].game.name] += 0.1;
                    }
                }
                // Create member stats if necessary
                if(!stats[bot.servers[i].id].members[bot.servers[i].members[j].id]) {
                    stats[bot.servers[i].id].members[bot.servers[i].members[j].id] = {
                        messages: 0,
                        seen: new Date().getTime(),
                        mentions: {
                            pm: false,
                            stream: []
                        }
                    };
                }
                // If member's mention data is 7 days old, clear it
                if(stats[bot.servers[i].id].members[bot.servers[i].members[j].id].mentions.stream.length>0) {
                    if(dayDiff(new Date(stats[bot.servers[i].id].members[bot.servers[i].members[j].id].mentions.stream[0].timestamp), new Date())>=7) {
                        stats[bot.servers[i].id].members[bot.servers[i].members[j].id].mentions.timestamp = 0;
                        stats[bot.servers[i].id].members[bot.servers[i].members[j].id].mentions.stream = [];
                    }
                }
            }
        }
    }
    saveData("./data/stats.json", function(err) {
        if(err) {
            logMsg(new Date().getTime(), "ERROR", "General", null, "Could not save updated stats");
        }
    });
    setTimeout(function() {
        clearStatCounter();
    }, 300000);
}

// Clear stats.json for a server
function clearServerStats(svrid) {
    var topMembers = [];
    for(var member in stats[svrid].members) {
        topMembers.push([member, stats[svrid].members[member].messages]);
        stats[svrid].members[member].messages = 0;
    }
    var svr = bot.servers.get("id", svrid);
    if(svr && configs.servers[svrid].points.value) {
        topMembers.sort(function(a, b) {
            return a[1] - b[1];
        });
        for(var i=topMembers.length-1; i>topMembers.length-4; i--) {
            if(i<0) {
                break;
            }
            var usr = bot.users.get("id", topMembers[i][0]);
            if(usr) {
                var amount = Math.ceil(topMembers[i][1] / 10);
                logMsg(new Date().getTime(), "INFO", svr.name, null, usr.username + " won " + amount + " in the weekly activity contest");
                if(!profileData[usr.id]) {
                    profileData[usr.id] = {
                        points: 0,
                    }
                }
                profileData[usr.id].points += amount;
            }
        }
        saveData("./data/profiles.json", function(err) {
            if(err) {
                logMsg(new Date().getTime(), "ERROR", "General", null, "Failed to save update profile data");
            }
        });
    }
    for(var game in stats[svrid].games) {
        delete stats[svrid].games[game];
    }
    for(var cmd in stats[svrid].commands) {
        delete stats[svrid].commands[cmd];
    }
}

// Start timer extensions on all servers
function runTimerExtensions() {
    for(var svrid in configs.servers) {
        for(var extnm in configs.servers[svrid].extensions) {
            if(configs.servers[svrid].extensions[extnm].type=="timer") {
                runTimerExtension(svrid, extnm);
            }
        }
    }
}

// Run a specific timer extension
function runTimerExtension(svrid, extnm) {
    var extension = configs.servers[svrid].extensions[extnm];
    if(extension) {
        var svr = bot.servers.get("id", svrid);
        var params = {
            unirest: unirest,
            imgur: imgur,
            image: giSearch,
            setTimeout: setTimeout,
            JSON: JSON,
            Math: Math,
            isNaN: isNaN,
            Date: Date,
            Array: Array,
            Number: Number,
            send: ""
        }
        try {
            var context = new vm.createContext(params);
            var script = new vm.Script(extension.process);
            script.runInContext(context);
            var wait = function(count) {
                if(params.send=="" || !params.send) {
                    setTimeout(function() {
                        wait(count);
                    }, 100);
                } else if(count>30) {
                    logMsg(new Date().getTime(), "WARN", svr.name, null, "Timer extension " + extension.type + " produced no output");
                } else {
                    for(var i=0; i<extension.channels.length; i++) {
                        var ch = svr.channels.get("name", extension.channels[i]);
                        if(ch) {
                            bot.sendMessage(ch, params.send);
                            logMsg(new Date().getTime(), "INFO", svr.name, ch.name, "Timer extension " + extension.type + " executed successfully");
                        }
                    }
                }
            };
            wait(0);
        } catch(runError) {
            logMsg(new Date().getTime(), "ERROR", svr.name, null, "Failed to run timer extension " + extension.type + ": " + runError);
        }
        setTimeout(function() {
            runTimerExtension(svrid, extnm);
        }, extension.interval * 1000);
    }
}

// Converts seconds to a nicely formatted string in years, days, hours, minutes, seconds
function secondsToString(seconds) {
    var numyears = Math.floor(seconds / 31536000);
    var numdays = Math.floor((seconds % 31536000) / 86400);
    var numhours = Math.floor(((seconds % 31536000) % 86400) / 3600);
    var numminutes = Math.floor((((seconds % 31536000) % 86400) % 3600) / 60);
    var numseconds = Math.round((((seconds % 31536000) % 86400) % 3600) % 60);
    
    var str = "";
    if(numyears>0) {
        str += numyears + " year" + (numyears==1 ? "" : "s") + " ";
    }
    if(numdays>0) {
        str += numdays + " day" + (numdays==1 ? "" : "s") + " ";
    }
    if(numhours>0) {
        str += numhours + " hour" + (numhours==1 ? "" : "s") + " ";
    }
    if(numminutes>0) {
        str += numminutes + " minute" + (numminutes==1 ? "" : "s") + " ";
    }
    if(numseconds>0) {
        str += numseconds + " second" + (numseconds==1 ? "" : "s") + " ";
    }
    return str;
}

// Generate key for online config
function genToken(length) {
    var key = "";
    var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

    for(var i=0; i<length; i++) {
        key += possible.charAt(Math.floor(Math.random() * possible.length));
    }

    return key;
}

// Get online console session with given authtoken
function getOnlineConsole(token) {
    var session = {};
    for(var s in onlineconsole) {
        if(onlineconsole[s].token==token) {
            session = {
                usrid: s,
                token: onlineconsole[s].token,
                type: onlineconsole[s].type
            };
            if(onlineconsole[s].svrid) {
                session.svrid = onlineconsole[s].svrid;
            }
        }
    }
    return session;
}

// Parse JSON data from POST for maintainer console
function parseMaintainerConfig(delta, callback) {
    for(var key in delta) {
        switch(key) {
            case "username":
                bot.setUsername(delta[key], function(err) {
                    if(err) {
                        logMsg(new Date().getTime(), "ERROR", "General", null, "Failed to change username to '" + delta[key] + "'");
                    } else {
                        logMsg(new Date().getTime(), "INFO", "General", null, "Changed bot username to " + delta[key] + "'");
                    }
                    callback(err);
                });
                break;
            case "game":
                bot.setStatus("online", delta[key]);
                if(delta[key]==".") {
                    delta[key] = "";
                    bot.setStatus("online", null);
                }
                logMsg(new Date().getTime(), "INFO", "General", null, "Set bot game to '" + delta[key] + "'");
                configs.game = delta[key];
                saveData("./data/config.json", function(err) {
                    if(err) {
                        logMsg(new Date().getTime(), "ERROR", "General", null, "Could not save new config");
                        throw new Error;
                    }
                    callback(err);
                });
                break;
            case "rmserver":
                var svr = bot.servers.get("id", delta[key]);
                if(!svr) {
                    callback(true);
                    return;
                }
                bot.leaveServer(svr, function(err) {
                    if(err) {
                        logMsg(new Date().getTime(), "ERROR", "General", null, "Failed to leave server " + svr.name);
                    } else {
                        delete configs.servers[svr.id];
                        delete messages[svr.id];
                        delete cleverOn[svr.id];
                        delete stats[svr.id];
                        logMsg(new Date().getTime(), "INFO", "General", null, "Left server " + svr.name);
                    }
                    callback(err);
                });
                break;
            case "joinserver":
                bot.joinServer(delta[key], function(err, svr) {
                    if(err) {
                        logMsg(new Date().getTime(), "WARN", "General", null, "Could not join new server, most likely user error");
                    }
                    callback(err);
                });
                break;
            case "clearstats":
                try {
                    clearServerStats(delta[key]);
                    logMsg(new Date().getTime(), "INFO", "General", null, "Cleared stats for " + svr.name);
                    callback(false);
                } catch(err) {
                    callback(err);
                }
                break;
            case "status":
                bot.setStatus(delta[key], configs.game, function(err) {
                    if(err) {
                        logMsg(new Date().getTime(), "ERROR", "General", null, "Failed to change status to " + delta[key]);
                    } else {
                        logMsg(new Date().getTime(), "INFO", "General", null, "Changed bot status to " + delta[key]);
                    }
                    callback(err);
                });
                break;
            case "kill":
                saveData("./data/stats.json", function(err) {
                    process.exit(0);
                });
                break;
            case "logout":
                clearTimeout(onlineconsole[delta[key]].timer);
                delete onlineconsole[delta[key]];
                logMsg(new Date().getTime(), "INFO", "General", null, "Logged out of online maintainer console");
                callback(false);
                break;
        }
    }
}

// Parse JSON data from POST for admin console
function parseAdminConfig(delta, svr, consoleid, callback) {
    for(var key in delta) {
        switch(key) {
            case "admins":
            case "blocked":
                if(isNaN(delta[key])) {
                    callback(true);
                    return;
                }
                var usr = svr.members.get("id", delta[key]);
                if(usr) {
                    if(configs.servers[svr.id][key].value.indexOf(usr.id)>-1) {
                        if(key=="admins" && (usr.id==consoleid || usr.id==svr.owner.id || usr.id==configs.maintainer)) {
                            callback(true);
                            return;
                        }
                        logMsg(new Date().getTime(), "INFO", consoleid, null, "Removed " + usr.username + " from" + key + " list in " + svr.name);
                        configs.servers[svr.id][key].value.splice(configs.servers[svr.id][key].value.indexOf(usr.id), 1);
                    } else {
                        if(key=="blocked" && (usr.id==consoleid || usr.id==svr.owner.id || usr.id==configs.maintainer)) {
                            callback(true);
                            return;
                        }
                        logMsg(new Date().getTime(), "INFO", consoleid, null, "Added " + usr.username + " to " + key + " list in " + svr.name);
                        configs.servers[svr.id][key].value.push(usr.id);
                    }
                } else {
                    callback(true);
                    return;
                }
                break;
            case "rss":
                if(!Array.isArray(delta[key])) {
                    if(configs.servers[svr.id].rss.value[2][delta[key]]) {
                        logMsg(new Date().getTime(), "INFO", consoleid, null, "Feed " + configs.servers[svr.id].rss.value[2][delta[key]] + " removed in " + svr.name);
                        configs.servers[svr.id].rss.value[1].splice(delta[key], 1);
                        configs.servers[svr.id].rss.value[2].splice(delta[key], 1);
                    } else {
                        callback(true);
                        return;
                    }
                } else {
                    if(configs.servers[svr.id].rss.value[2].indexOf(delta[key][1])==-1) {
                        configs.servers[svr.id].rss.value[1].push(delta[key][0]);
                        configs.servers[svr.id].rss.value[2].push(delta[key][1]);
                        logMsg(new Date().getTime(), "INFO", consoleid, null, "Feed " + delta[key][1] + " added in " + svr.name);
                    } else {
                        callback(true);
                        return;
                    } 
                }
                break;
            case "close":
                for(var i=0; i<svr.channels.length; i++) {
                    if(trivia[svr.channels[i].id]) {
                        bot.sendMessage(svr.channels[i], "Sorry to interrupt your game, but an admin has closed this trivia session.");
                        commands["trivia"].process(bot, {"channel": svr.channels[i]}, "end");
                        logMsg(new Date().getTime(), "INFO", consoleid, null, "Closed trivia game in " + svr.channels[i].name + ", " + svr.name);
                        delete trivia[svr.channels[i].id];
                    }
                    var act = activePolls(svr.channels[i].id);
                    if(act) {
                        bot.sendMessage(svr.channels[i], "The ongoing poll in this channel has been closed by an admin.");
                        bot.sendMessage(svr.channels[i], pollResults(act, "The results are in", "and the winner is"));
                        logMsg(new Date().getTime(), "INFO", consoleid, null, "Closed active poll in " + svr.channels[i].name + ", " + svr.name);
                        delete polls[act];
                    }
                }
                return;
            case "clean":
                var ch = svr.channels.get("id", delta[key][0]);
                if(ch && !isNaN(delta[key][1])) {
                    cleanMessages(ch, delta[key][1], null, callback);
                } else {
                    callback(true);
                } 
                return;
            case "extensions":
                if(typeof delta[key]=="string") {
                    delta[key] = decodeURI(delta[key]);
                    if(configs.servers[svr.id].extensions[delta[key]]) {
                        delete configs.servers[svr.id].extensions[delta[key]];
                        logMsg(new Date().getTime(), "INFO", consoleid, null, "Deleted extension " + delta[key] + " from " + svr.name);
                        break;
                    } else {
                        callback(true);
                        return;
                    }
                } else {
                    addExtension(delta[key], svr, consoleid, callback);
                    return;
                }
            case "leave":
                if(bot.servers.length==1) {
                    parseMaintainerConfig({rmserver: svr.id}, callback);
                } else {
                    callback(true);
                }
                return;
            case "logout":
                clearTimeout(onlineconsole[consoleid].timer);
                delete adminconsole[consoleid];
                delete onlineconsole[consoleid];
                logMsg(new Date().getTime(), "INFO", consoleid, null, "Logged out of online admin console");
                callback(false);
                return;
            default:
                if(configs.servers[svr.id][key]) {
                    configs.servers[svr.id][key].value = delta[key];
                    var yn = delta[key] ? "on" : "off";
                    logMsg(new Date().getTime(), "INFO", consoleid, null, "Command " + key + " turned " + yn + " in " + svr.name);
                } else {
                    callback(true);
                    return;
                }
                break;
        }
    }
    saveData("./data/config.json", function(err) {
        if(err) {
            logMsg(new Date().getTime(), "ERROR", "General", null, "Failed to save updated configs for " + svr.name);
        }
        callback(err);
        return; 
    });
}

// Parses and applies new extension from [online] admin console
function addExtension(extension, svr, consoleid, callback) {
    var validity;
    if(!extension.name || !extension.type || (!extension.key && extension.type!="timer") || !extension.process) {
        validity = "missing parameter(s)";
    } else if(["keyword", "command", "timer"].indexOf(extension.type.toLowerCase())==-1) {
        validity = "invalid type";
    } else if(extension.type=="timer" && !extension.interval) {
        validity = "no interval provided";
    } else if(extension.type=="timer" && (extension.interval<10 || extension.interval>86400)) {
        validity = "interval must be between 10 seconds and 1 day";
    } else if(extension.type=="timer" && !extension.channels) {
        validity = "no channel(s) provided";
    } else if(extension.type=="command" && extension.key.indexOf(" ")>-1) {
        validity = "command has spaces";
    } else if(extension.type=="command" && commands[extension.key]) {
        validity = "replaces default command";
    } else if(extension.type=="keyword" && !Array.isArray(extension.key)) {
        validity = "keyword must be in an array";
    } else if(extension.type=="command" && Array.isArray(extension.key)) {
        validity = "array as command key";
    } else if(extension.type=="keyword" && extension.case==null) {
        validity = "case sensitivity not specified";
    } else if(configs.servers[svr.id].extensions[extension.name]) {
        validity = "extension already exists";
    } else {
        var params = {
            unirest: unirest,
            imgur: imgur,
            image: giSearch,
            message: bot.user.mention() + " " + extension.key + " test",
            author: bot.user.mention(),
            setTimeout: setTimeout,
            JSON: JSON,
            Math: Math,
            isNaN: isNaN,
            Date: Date,
            Array: Array,
            Number: Number,
            send: ""
        }
        try {
            var context = new vm.createContext(params);
            var script = new vm.Script(extension.process);
            script.runInContext(context);
            setTimeout(function() {
                if(params.send=="" || !params.send) {
                    validity = "no output";   
                }
            }, 3000);
        } catch(runError) {
            validity = runError;
        }
    }
    
    if(validity) {
        logMsg(new Date().getTime(), "WARN", consoleid, null, "Extension uploaded is invalid: " +  validity);
        callback(validity);
    } else {
        configs.servers[svr.id].extensions[extension.name] = extension;
        if(extension.type=="timer") {
            runTimerExtension(svr.id, extension.name);
        }
        logMsg(new Date().getTime(), "INFO", consoleid, null, "Extension " + extension.name + " added to server " + svr.name);
        delete configs.servers[svr.id].extensions[extension.name].name;
        saveData("./data/config.json", function(err) {
            if(err) {
                logMsg(new Date().getTime(), "ERROR", consoleid, null, "Could not save new config for " + svr.name);
                callback(true);
            } else {
                var info = "Great, it works! You can use this extension on the server now.\nUpdated extension list:";
                for(var ext in configs.servers[svr.id].extensions) {
                    info += "\n\t" + ext + ", " + configs.servers[svr.id].extensions[ext].type;
                }
                callback();
            }
        });
    }
}

// Default config file
var defaultConfigFile = {
    admins: {
        value: [],
        option: "<username or ID to add/remove>"
    },
    blocked: {
        value: [],
        option: "<username or ID to add/remove, or `.` to clear>"
    },
    newgreeting: {
        value: "",
        option: "<new member greeting text or `.` to remove>"
    },
    rss: {
        value: [true, ["http://news.google.com/news?cf=all&hl=en&pz=1&ned=us&topic=h&num=3&output=rss"], ["gnews"]],
        option: "<feed name to remove, url to add\*, or enabled y/n> <\*name to add>"
    },
    servermod: {
        value: true,
        option: "<enabled? y/n>"
    },
    spamfilter: {
        value: true,
        option: "<enabled? y/n>"
    },
    nsfwfilter: {
        value: true,
        option: "<enabled? y/n>"
    },
    stats: {
        value: true,
        option: "<enabled? y/n>"
    },
    points: {
        value: true,
        option: "<enabled? y/n>"
    },
    chatterbot: {
        value: true,
        option: "<enabled? y/n>"
    },
    linkme: {
        value: true,
        option: "<enabled? y/n>"
    },
    say: {
        value: true,
        option: "<enabled? y/n>"
    },
    convert: {
        value: true,
        option: "<allow? y/n>"
    },
    quote: {
        value: true,
        option: "<allow? y/n>"
    },
    twitter: {
        value: true,
        option: "<allow? y/n>"
    },
    youtube: {
        value: true,
        option: "<allow? y/n>"
    },
    image: {
        value: true,
        option: "<allow? y/n>"
    },
    gif: {
        value: true,
        option: "<allow? y/n>"
    },
    wolfram: {
        value: true,
        option: "<allow? y/n>"
    },
    wiki: {
        value: true,
        option: "<allow? y/n>"
    },
    weather: {
        value: true,
        option: "<enabled? y/n>"
    },
    stock: {
        value: true,
        option: "<allow? y/n>"
    },
    reddit: {
        value: true,
        option: "<allow? y/n>"
    },
    roll: {
        value: true,
        option: "<allow? y/n>"
    },
    games: {
        value: true,
        option: "<allow? y/n>"
    },
    profile: {
        value: true,
        option: "<allow? y/n>"
    },
    tagreaction: {
        value: true,
        option: "<enabled? y/n>"
    },
    poll: {
        value: true,
        option: "<allow? y/n>"
    },
    trivia: {
        value: true,
        option: "<allow? y/n>"
    },
    extensions: {}
};

// Adds default settings for a server to config.json
function defaultConfig(svr) {
    if(!configs.servers[svr.id]) {
        var adminList = [svr.owner.id];
        if(svr.members.get("id", configs.maintainer) && adminList.indexOf(configs.maintainer)==-1) {
            adminList.push(configs.maintainer);
        }
        for(var i=0; i<svr.members.length; i++) {
            if(svr.rolesOfUser(svr.members[i])) {
                for(var j=0; j<svr.rolesOfUser(svr.members[i]).length; j++) {
                    if(svr.rolesOfUser(svr.members[i])[j].hasPermission("banMembers") && adminList.indexOf(svr.members[i].id)==-1 && svr.members[i].id!=bot.user.id) {
                        adminList.push(svr.members[i].id);
                    }
                }
            }
        }
        configs.servers[svr.id] = JSON.parse(JSON.stringify(defaultConfigFile)); 
        configs.servers[svr.id].admins.value = adminList;
        saveData("./data/config.json", function(err) {
            if(err) {
                logMsg(new Date().getTime(), "ERROR", svr.name, null, "Failed to save default configs");
            } else {
                logMsg(new Date().getTime(), "INFO", svr.name, null, "Successfully saved default configs");
            }
        });
    }
}

// Update bot to new version via Git (beta)
function updateBot(msg) {
    logMsg(new Date().getTime(), "INFO", "General", null, "Updating " + bot.user.username + ":");
    bot.sendMessage(msg.channel, "*Updating " + bot.user.username + ". This feature is in beta, and may not work.*");
    var spawn = require("child_process").spawn;
    var log = function(err, stdout, stderr) {
        if(stdout) {
            console.log(stdout);
        }
        if(stderr) {
            console.log(stderr);
        }
    };
    var fetch = spawn("git", ["fetch"]);
    fetch.stdout.on("data", function(data) {
        console.log(data.toString());
    });
    fetch.on("close", function(code) {
        var add = spawn("git", ["add", "auth.json", "config.json", "stats.json", "reminders.json", "profiles.json"]);
        add.stdout.on("data", function(data) {
            console.log(data.toString());
        });
        add.on("close", function(code) {
            var checkout = spawn("git", ["checkout", "."]);
            checkout.stdout.on("data", function(data) {
                console.log(data.toString());
            });
            checkout.on("close", function(code) {
                var npm = spawn("npm", ["install"]);
                npm.stdout.on("data", function(data) {
                    console.log(data.toString());
                });
                npm.on("close", function(code) {
                    logMsg(new Date().getTime(), "INFO", "General", null, "Successfully updated");
                    bot.sendMessage(msg.channel, "Done! Shutting down...", function() {
                        bot.logout(function() {
                            process.exit(1);
                        });
                    });
                });
            });
        });
    });
    logMsg(new Date().getTime(), "ERROR", "General", null, "Could not update " + bot.user.username);
    bot.sendMessage(msg.channel, "Something went wrong, could not update.");
}

// Ensure that config.json is setup properly
function checkConfig(svr) {
    var changed = false;
     
    for(var config in defaultConfigFile) {
        if(!configs.servers[svr.id][config]) {
            changed = true;
            configs.servers[svr.id][config] = defaultConfigFile[config];
        }
    }
    
    for(config in configs.servers[svr.id]) {
        if(!defaultConfigFile[config]) {
            changed = true;
            delete configs.servers[svr.id][config];
        }
    }
    
    if(changed) {
        saveData("./data/config.json", function(err) {
            if(err) {
                logMsg(new Date().getTime(), "ERROR", svr.name, null, "Failed to update server configs");
            } else {
                logMsg(new Date().getTime(), "INFO", svr.name, null, "Successfully saved new server configs");
            }
        });
    }
}

// Write an updated config.json file to disk
function saveData(file, callback) {
    var object;
    switch(file) {
        case "./data/profiles.json": 
            object = profileData;
            break;
        case "./data/stats.json":
            object = stats;
            break;
        case "./data/config.json":
            object = configs;
            break;
        case "./auth.json":
            object = AuthDetails;
            break;
        case "./data/reminders.json":
            object = reminders;
            break;
    }
    writeFileAtomic(file, JSON.stringify(object, null, 4), function(error) {
        if(error) {
            fs.writeFile(file, JSON.stringify(object, null, 4), function(err) {
                callback(err);
            });
        } else {
            callback(error);
        }
    });
}

// Check if other admins of a server are logged into the console, return true if yes
function activeAdmins(svrid) {
    for(var i=0; i<configs.servers[svrid].admins.value.length; i++) {
        if(adminconsole[configs.servers[svrid].admins.value[i]]) {
            return true;
        }
    }
    return false;
}

// Check if there are other polls on the same channel
function activePolls(chid) {
    for(var poll in polls) {
        if(polls[poll].channel==chid) {
            return poll;
        }
    }
    return;
}

// Generate results for poll
function pollResults(usrid, intro, outro) {
    var responseCount = countOccurrences(polls[usrid].responses, polls[usrid].options);
    var info = "" + intro + " for the poll: **" + polls[usrid].title + "**";
    for(var i=0; i<polls[usrid].options.length; i++) {
        var c = responseCount[i];
        var d = true;
        if(!c || isNaN(c)) {
            c = 0;
            responseCount[i] = 0;
            d = false;
        }
        info += "\n\t" + i + ") " + polls[usrid].options[i] + ": " + c + " votes";
        if(d) {
            info += ", " + (Math.round((c / polls[usrid].responses.length * 100)*100)/100) + "%";
        }
    }

    var winner = maxIndex(responseCount);
    info += "\n" + polls[usrid].responses.length + " votes, ";
    if((responseCount.allValuesSame() || duplicateMax(responseCount)) && polls[usrid].options.length > 1) {
        info += "tie!";
    } else {
        info += outro + ": " + polls[usrid].options[winner];
    }
    info += "\n*Poll open for " + secondsToString((new Date().getTime() - polls[usrid].timestamp)/1000).slice(0, -1) + "*";
    
    return info;
}

// Attempt to kick a member
function kickUser(msg, desc1, desc2) {
    bot.kickMember(msg.author, msg.channel.server, function(err) {
        if(err) {
            bot.sendMessage(msg.author, "Stop " + desc2 + ". The chat mods have been notified about this, and you have been blocked from using me.");
            adminMsg(false, msg.channel.server, msg.author, " " + desc1 + " in " + msg.channel.server.name + ", so I blocked them from using me.");
            saveData("./data/config.json", function(error) {
                if(error) {
                    logMsg(new Date().getTime(), "ERROR", "General", null, "Failed to save updated configs for " + svr.name);
                }
            });
        } else {
            adminMsg(err, msg.channel.server, msg.author, " " + desc1 + " in " + msg.channel.server.name + ", so I kicked them from the server.");
        }
    });
}

// Searches Google Images for keyword(s)
function giSearch(query, num, callback) {
	var url = "https://www.googleapis.com/customsearch/v1?key=" + AuthDetails.google_api_key + "&cx=" + AuthDetails.custom_search_id + "&safe=high&q=" + (query.replace(/\s/g, '+').replace(/&/g, '')) + "&alt=json&searchType=image" + num;
    unirest.get(url)
    .header("Accept", "application/json")
    .end(function(response) {
        var data = response.body;
        if(!data) {
			logMsg(new Date().getTime(), "ERROR", "General", null, "Could not connect to Google Images");
			return;
		}
		if(!data.items || data.items.length == 0 || query.indexOf("<#")>-1) {
            logMsg(new Date().getTime(), "WARN", "General", null, "No image results for " + query);
            callback(null);
		} else {
            callback(data.items[0].link);
		}
	});	
}

// Google Play Store search page scraper
function scrapeSearch(data) {
    x = cheerio.load(data);
    var card_list = x(".card-list");
    var items = [];
    card_list.find(".card").each(function() {
        var card = {};
        var card_data = x(this);
        card["cover-image"] = card_data.find("img.cover-image").attr("src");
        card["click-target"] = card_data.find(".card-click-target").attr("src");
        card["name"] = card_data.find(".details .title").attr("title");
        card["url"] = "https://play.google.com" + card_data.find(".details .title").attr("href");
        card["company"] = card_data.find(".details .subtitle").attr("title");
        card["html_description"] = card_data.find(".details .description").text();
        card["rating_description"] = card_data.find(".tiny-star").attr("aria-label");
        var rating_style = card_data.find(".tiny-star .current-rating").attr("style");
        if(rating_style) {
            card["rating"] = parseFloat(rating_style.match(/\d+/g)[0]*5 / 100.0);
        } else {
            card["rating"] = "unknown";
        }
        card["price"] = card_data.find(".price-container .display-price").text();

        items.push(card);
    });

    var result = {
        total: items.length,
        items: items
    };

    return result;
}

// Searches Giphy for matching GIFs
function getGIF(tags, callback, rating) {
    var params = {
        "api_key": AuthDetails.giphy_api_key,
        "rating": rating,
        "format": "json",
        "limit": 1
    };
    var query = qs.stringify(params);

    if(tags!==null) {
        query += "&tag=" + tags.join("+")
    }
    
    unirest.get("http://api.giphy.com/v1/gifs/random?" + query)
    .header("Accept", "application/json")
    .end(function(response) {
        if(response.status!==200 || !response.body) {
            logMsg(new Date().getTime(), "ERROR", "General", null, "Could not connect to Giphy");
            callback(null);
        } else {
            callback(response.body.data.id);
        }
    }.bind(this));
}

// Get YouTube URL given tags as query
function ytSearch(query, callback) {
    var youtube = new youtube_node();
    youtube.setKey(AuthDetails.google_api_key);
    var q;
	youtube.search(query, 1, function(error, result) {
        if(error) {
            logMsg(new Date().getTime(), "ERROR", "General", null, "Could not connect to YouTube");
            q =  "`¯\\_(ツ)_/¯`";
        } else {
            if (!result || !result.items || result.items.length < 1) {
                logMsg(new Date().getTime(), "WARN", "General", null, "No YouTube results for " + query);
                q = "`¯\\_(ツ)_/¯`";
            } else {
                switch(result.items[0].id.kind) {
                    case "youtube#playlist":
                        q = "http://www.youtube.com/playlist?list=" + result.items[0].id.playlistId;
                        break;
                    case "youtube#video":
                        q = "http://www.youtube.com/watch?v=" + result.items[0].id.videoId;
                        break;
                    case "youtube#channel":
                        q = "http://www.youtube.com/channel/" + result.items[0].id.channelId;
                        break;
                }
            }
        }
        callback(q);
    });
}

// Generate printable stats for a server
function getStats(svr) {
    var sortedMembers = [];
    for(var member in stats[svr.id].members) {
        sortedMembers.push([member, stats[svr.id].members[member].messages]);
    }
    sortedMembers.sort(function(a, b) {
        return a[1] - b[1];
    });
    var sortedGames = [];
    for(var game in stats[svr.id].games) {
        sortedGames.push([game, stats[svr.id].games[game]]);
    }
    sortedGames.sort(function(a, b) {
        return a[1] - b[1];
    });
    var sortedCommands = [];
    var commandSum = 0;
    for(var cmd in stats[svr.id].commands) {
        commandSum += stats[svr.id].commands[cmd];
        sortedCommands.push([cmd, stats[svr.id].commands[cmd]]);
    }
    sortedCommands.sort(function(a, b) {
        return a[1] - b[1];
    });
    
    var info = {
        "Most active members": [],
        "Most played games": [],
        "Command usage": [],
        "Data since": prettyDate(new Date(stats.timestamp))
    };
    for(var i=sortedMembers.length-1; i>sortedMembers.length-6; i--) {
        if(i<0) {
            break;
        }
        var usr = svr.members.get("id", sortedMembers[i][0]);
        if(usr && sortedMembers[i][1]>0) {
            info["Most active members"].push(usr.username.replaceAll("\"", "'") + ": " + sortedMembers[i][1] + " message" + (sortedMembers[i][1]==1 ? "" : "s"));
        }
    }
    for(var i=sortedGames.length-1; i>sortedGames.length-6; i--) {
        if(i<0) {
            break;
        }
        info["Most played games"].push(sortedGames[i][0].replaceAll("\"", "'") + ": " + secondsToString(sortedGames[i][1] * 3000));
    }
    for(var i=sortedCommands.length-1; i>sortedCommands.length-6; i--) {
        if(i<0) {
            break;
        }
        if(sortedCommands[i][1]>0) {
            var p = Math.floor(100 * sortedCommands[i][1] / commandSum);
            info["Command usage"].push(("  " + p).substring(p.toString().length-1) + "% " + sortedCommands[i][0] + ": " + sortedCommands[i][1] + " use" + (sortedCommands[i][1]==1 ? "" : "s"));
        }
    }
    for(var key in info) {
        if(info[key].length==0) {
            delete info[key];
        }
    }
    return info;
} 

// Get total command usage across all servers
function totalCommandUsage() {
    var usage = {};
    for(var svrid in stats) {
        if(svrid=="timestamp") {
            continue;
        }
        for(var cmd in stats[svrid].commands) {
            if(!usage[cmd]) {
                usage[cmd] = 0;
            }
            usage[cmd] += stats[svrid].commands[cmd];
        }
    }
    
    var commands = [];
    var sum = 0;
    for(var cmd in usage) {
        sum += usage[cmd]; 
        commands.push([cmd, usage[cmd]]);
    }
    commands.sort(function(a, b) {
        return a[1] - b[1];
    });
    for(var i=commands.length-1; i>=0; i--) {
        var p = Math.floor(100 * commands[i][1] / sum);
        commands[i] = ("  " + p).substring(p.toString().length-1) + "% " + commands[i][0] + ": " + commands[i][1] + " use" + (commands[i][1]==1 ? "" : "s");
    }
    return commands;
}

// Generate printable user profile
function getProfile(usr, svr) {
    var usrinfo = {
        "ID": usr.id,
        "Status": usr.status
    }
    usrinfo["Avatar"] = "http://i.imgur.com/fU70HJK.png";
    if(usr.avatarURL) {
        usrinfo["Avatar"] = usr.avatarURL;
    }
    if(usr.game) {
        if(usr.game.name) {
            usrinfo["Playing"] = usr.game.name.replaceAll("\"", "'");
        }
    }
    if(!profileData[usr.id]) {
        profileData[usr.id] = {
            points: 0,
        }
        saveData("./data/profiles.json", function(err) {
            if(err) {
                logMsg(new Date().getTime(), "ERROR", "General", null, "Failed to save profile data for " + usr.username);
            }
        });
    }
    for(var field in profileData[usr.id]) {
        usrinfo[(field.charAt(0).toUpperCase() + field.slice(1)).replaceAll("\"", "'")] = profileData[usr.id][field].toString().replaceAll("\"", "'");
    }
    var details = svr.detailsOfUser(usr);
    var svrinfo = {};
    if(details) {
        if(details.roles.length>0) {
            svrinfo["Roles"] = details.roles[0].name.replaceAll("\"", "'");
            for(var i=1; i<details.roles.length; i++) {
                info += ", " + details.roles[i].name.replaceAll("\"", "'");
            }
        }
        svrinfo["Joined"] = prettyDate(new Date(details.joinedAt));
    }
    svrinfo["Messages"] = stats[svr.id].members[usr.id].messages + " this week";
    if(usr.status!="online" && configs.servers[svr.id].stats.value) {
        var seen = prettyDate(new Date(stats[svr.id].members[usr.id].seen));
        svrinfo["Last seen"] = secondsToString((new Date().getTime() - stats[svr.id].members[usr.id].seen)/1000) + "ago";
    }
    var other = 0;
    for(var i=0; i<bot.servers.length; i++) {
        if(bot.servers[i].members.get("id", usr.id)) {
            other++;
        }
    }
    var info = {};
    info["User profile: @" + usr.username] = usrinfo;
    info["On " + svr.name] = svrinfo;
    return info;
}

// Delete last n bot messages
function cleanMessages(ch, count, option, callback) {
    getMessages(ch, option, function(error, messages) {
        if(!error) {
            for(var i=0; i<messages.length; i++) {
                if(messages[i].author.id==bot.user.id) {
                    count--;
                    bot.deleteMessage(messages[i]);
                    if(count==0) {
                        logMsg(new Date().getTime(), "INFO", ch.server.name, ch.name, "Finished cleaning messages");
                        callback();
                        break;
                    }
                }
            }
            if(count>0) {
                cleanMessages(ch, count, {before: messages[messages.length-1]});
            }
        } else {
            logMsg(new Date().getTime(), "ERROR", ch.server.name, ch.name, "Failed to fetch old messages for cleaning");
            callback(true);
        }
    });
}

// Archives messages in a channel
function archiveMessages(ch, count, callback) {
    bot.getChannelLogs(ch, count, function(error, messages) {
        if(!error) {
            var archive = [];
            for(var i=0; i<messages.length; i++) {
                archive.push({
                    timestamp: messages[i].timestamp,
                    id: messages[i].id,
                    edited: messages[i].editedTimestamp!=null,
                    content: messages[i].cleanContent,
                    attachments: messages[i].attachments,
                    author: messages[i].author.username  
                });
            }
            callback(false, archive);
        } else {
            logMsg(new Date().getTime(), "ERROR", ch.server.name, ch.name, "Failed to fetch old messages for archival");
            callback(true);
        }
    });
}

// Set reminder from natural language command
function parseReminder(suffix, usr, pch) {
    var tag = "";
    var ch = usr;
    if(pch) {
        tag = usr + " ";
        ch = pch;
    }
    
    var num, time, remind;
    if(suffix.indexOf("to ")==0) {
        suffix = suffix.substring(3);
        remind = suffix.substring(0, suffix.lastIndexOf(" in "));
        suffix = suffix.substring(suffix.lastIndexOf(" in ")+4);
        num = suffix;
        if(["d", "h", "m", "s"].indexOf(num.charAt(num.length-1).toString().toLowerCase())!=-1) {
            time = num.charAt(num.length-1).toString().toLowerCase();
            num = num.substring(0, num.length-1);
        } else if(num.indexOf(" ")!=-1) {
            time = num.substring(num.indexOf(" ")+1);
            num = num.substring(0, num.indexOf(" ")); 
        }
    } else {
        num = suffix.substring(0, suffix.indexOf(" "));
        suffix = suffix.substring(suffix.indexOf(" ")+1);
        time = "s";
        if(["d", "h", "m", "s"].indexOf(num.charAt(num.length-1).toString().toLowerCase())!=-1) {
            time = num.charAt(num.length-1).toString().toLowerCase();
            num = num.substring(0, num.length-1);
        } else {
            time = suffix.substring(0, suffix.indexOf(" ")).toLowerCase();
            suffix = suffix.substring(suffix.indexOf(" ")+1);
        }
        remind = suffix;
    }

    if(isNaN(num) || ["d", "h", "m", "s"].indexOf(time)==-1 || remind=="") {
        bot.sendMessage(ch, tag + "Sorry, I don't know what that means. Make sure you're using the syntax `remindme <no.> <h, m, or s> <note>`");
        return;
    } else if(num<0) {
        bot.sendMessage(ch, tag + "Uh...Why don't you check that again?");
    }
    logMsg(new Date().getTime(), "INFO", usr.id, null, "Reminder set in " + num + time);
    bot.sendMessage(ch, tag + "OK, I'll send you a PM in " + num + time.toLowerCase());
    
    var countdown = 0;
    switch(time) {
        case "d":
            countdown = num * 86400000;
            break;
        case "h":
            countdown = num * 3600000;
            break;
        case "m":
            countdown = num * 60000;
            break;
        case "s":
            countdown = num * 1000;
            break;
    }
    saveReminder(usr.id, remind, countdown);
}

// Save a reminder
function saveReminder(usrid, remind, countdown) {
    reminders.push({
        user: usrid,
        note: remind,
        time: new Date().getTime() + countdown
    });
    setReminder(reminders.length-1);
    saveData("./data/reminders.json", function(err) {
        if(err) {
            logMsg(new Date().getTime(), "ERROR", usrid, null, "Failed to save reminder");
        }
    });
}

// Set and send a reminder
function setReminder(i) {
    var obj = reminders[i];
    var usr = bot.users.get("id", obj.user);
    if(usr && obj) {
        var countdown = obj.time - new Date().getTime();
        setTimeout(function() {
            bot.sendMessage(usr, "**Reminder:** " + obj.note);
            logMsg(new Date().getTime(), "INFO", usr.id, null, "Reminded user " + usr.username);
            reminders.splice(i, 1);
            saveData("./data/reminders.json", function(err) {
                if(err) {
                    logMsg(new Date().getTime(), "ERROR", usr.id, null, "Failed to save reminder");
                }
            });
        }, countdown>0 ? countdown : 0);
    }
}

// Retrieve past messages for clean command
function getMessages(ch, option, callback) {
    if(option) {
        bot.getChannelLogs(ch, option, function(error, messages) {
            callback(error, messages);
        });
    } else {
        bot.getChannelLogs(ch, function(error, messages) {
            callback(error, messages);
        })
    }
}

// Message online bot admins in a server
function adminMsg(error, svr, author, info) {
    if(!error) {
        for(var i=0; i<configs.servers[svr.id].admins.value.length; i++) {
            var usr = bot.users.get("id", configs.servers[svr.id].admins.value[i]);
            if(usr.status!="offline" && usr) {
                bot.sendMessage(usr, "@" + author.username + info);
            }
        }
    } else {
        logMsg(new Date().getTime(), "ERROR", svr.name, null, "Failed to message bot admins");
    }
}

// Ouput a pretty date for logging
function prettyDate(date) {
    return date.getUTCFullYear() + "-" + ("0" + (date.getUTCMonth() + 1)).slice(-2) + "-" + ("0" + date.getUTCDate()).slice(-2) + " " + ("0" + date.getUTCHours()).slice(-2) + ":" + ("0" + date.getUTCMinutes()).slice(-2) + ":" + ("0" + date.getUTCSeconds()).slice(-2) + " UTC";
}

// Number of days between two dates
function dayDiff(first, second) {
    return Math.round((second-first) / (1000*60*60*24));
}

// Generate help text
function getHelp(svr) {
    var info = "";
    for(var cmd in commands) {
        if(commands[cmd]) {
            if(configs.servers[svr.id][cmd]) {
                if(!configs.servers[svr.id][cmd].value) {
                    continue;
                }
            }
            info += "\n\t" + cmd;
            if(commands[cmd].usage) {
                info += " " + commands[cmd].usage;
            }
        }
    }
    for(var ext in configs.servers[svr.id].extensions) {
        if(configs.servers[svr.id].extensions[ext].type.toLowerCase()=="command") {
            info += "\n\t" + configs.servers[svr.id].extensions[ext].key;
            if(configs.servers[svr.id].extensions[ext].usage) {
                info += " " + configs.servers[svr.id].extensions[ext].usage;
            }
        }
    }

    if(configs.servers[svr.id].rss.value[2].length>-1) {
        info += "\nThe following RSS feeds are available:";
        for(var i=0; i<configs.servers[svr.id].rss.value[2].length; i++) {
            info += "\n\t" + configs.servers[svr.id].rss.value[2][i];
        }
    }

    info += "\n\nFor example, you could do `@" + bot.user.username + " remindme 5 s Hello`. You can get app links from the Google Play store by using `linkme <some app>`.\n\nThe following commands are also available via PM:";
    for(var cmd in pmcommands) {
        info += "\n\t" + cmd;
        if(pmcommands[cmd].usage) {
            info += " " + pmcommands[cmd].usage.replace("<server>", svr.name);
        }
    }
    
    if(configs.servers[svr.id].points.value) {
        info += "\n\nFinally: *AwesomePoints*, a karma system for Discord. You can upvote someone with `@user <\"^\", \"+1\", or \"up\">`, and give 10 of your own points with `@user gild`. You'll lose points for doing bad things, and get a reward for being the most active user at the end of the week.";
    }
    info += "\n\nOn top of all this, you can talk to me about anything privately or in the main chat (by tagging me). Have fun! ;)\n\nVersion " + version + " by **@BitQuote**, https://git.io/vaa2F";
    return info;
}

// Get info on a specific command
function getCommandHelp(svr, cmd) {
    if(!commands[cmd] && !pmcommands[cmd]) {
        return "Command `" + cmd + "` not found.";
    }
    var pubdisabled = false;
    if(configs.servers[svr.id][cmd]) {
        if(!configs.servers[svr.id][cmd].value) {
            pubdisabled = true;
            if(!pmcommands[cmd]) {
                return "`" + cmd + "` is disabled on this server.";
            }
        }
    }
    var info = "";
    var pubtrue = false;
    if(commands[cmd] && !pubdisabled) {
        if(commands[cmd].extended) {
            pubtrue = true;
            info += "**Help for public command `" + cmd + "`:**\n" + commands[cmd].extended;
        }
    }
    if(pmcommands[cmd] && cmd!="remindme") {
        if(pmcommands[cmd].extended) {
            info += (pubtrue ? "\n\n" : "") + "**Help for private command `" + cmd + "`:**\n" + pmcommands[cmd].extended;
        }
    }
    if(!info) {
        info = "Extended help for `" + cmd + "` not available.";
    }
    return info;
}

// Log to database and console
function logMsg(timestamp, level, id, ch, msg) {
    logs.push({
        timestamp: timestamp,
        level: level,
        id: id,
        ch: ch,
        msg: msg.replaceAll("\"", "'")
    });
    console.log(printLog(logs[logs.length-1]));
}

// Get printable log message
function printLog(log) {
    var printnm = log.id + (log.ch ? (", " + log.ch) : "");
    if(!isNaN(log.id)) {
        var usr = bot.users.get("id", log.id);
        printnm = usr ? ("@" + usr.username) : log.id;
    }
    return "[" + prettyDate(new Date(log.timestamp)) + "] [" + log.level + "] [" + printnm + "] " + log.msg;
}

// Filter and print logs by parameter
function getLog(idFilter, levelFilter) {
    var results = logs.filter(function(obj) {
        if(idFilter && levelFilter) {
            return obj.id==idFilter && obj.level==levelFilter;
        } else if(idFilter && !levelFilter) {
            return obj.id==idFilter;
        } else if(!idFilter && levelFilter) {
            return obj.level==levelFilter;
        } else {
            return true;
        }
    });
    var printables = [];
    for(var i=0; i<results.length; i++) {
        printables.push(printLog(results[i]));
    }
    return printables;
}

// Count number of log IDs
function getLogIDs() {
    var ids = [];
    var secs = [];
    for(var i=0; i<logs.length; i++) {
        var cand;
        var secc;
        if(!isNaN(logs[i].id)) {
            secc = logs[i].id;
            cand = bot.users.get("id", logs[i].id).username.replaceAll("\"", "'");
        } else {
            secc = ".";
            cand = logs[i].id.replaceAll("\"", "'");
        }
        if(ids.indexOf(cand)==-1) {
            secs.push(secc);
            ids.push(cand);
        }
    }
    var f = [];
    for(var i=0; i<ids.length; i++) {
        f.push([ids[i], secs[i]]);
    }
    return f;
}

// Check for updates
function checkVersion() {
    unirest.get("http://awesome-botmakersinc.rhcloud.com/")
    .header("Accept", "application/json")
    .end(function(response) {
        try {
            if(!response.body || !response.body[0]) {
                logMsg(new Date().getTime(), "ERROR", "General", null, "Failed to check for updates");
                return;
            }
            response.body = JSON.parse(response.body);
            
            var info;
            var change = "";
            var v = "";
            if(version.indexOf("-UNOFFICIAL")>-1) {
                v = version.substring(0, version.indexOf("-UNOFFICIAL"));
            } else {
                v = version;
            }
            if(response.body[0][0]!=v && response.body.indexOf(version)!=outOfDate) {
                outOfDate = -1;
                for(var i=0; i<response.body.length; i++) {
                    if(response.body[i][0]==v) {
                        outOfDate = i;
                    }
                }
                if(outOfDate==-1) {
                    info = "many, many";
                } else {
                    if(response.body[outOfDate][1]) {
                        change = response.body[outOfDate][1];
                    }
                    info = outOfDate;
                }
                logMsg(new Date().getTime(), "INFO", "General", null, "Found " + info + " new bot updates");
                var send = "There are " + info + " new update" + (info==1 ? "" : "s") + " available for " + bot.user.username;
                for(var i=0; i<outOfDate; i++) {
                    send += "\n\t" + (response.body[i][0] + "             ").slice(0,15);
                    if(response.body[i][1]) {
                        send += response.body[i][1];
                    }
                }
                send += "\nLearn more at https://git.io/vaa2F";
                
                if(configs.maintainer && configs.maintainer!="") {
                    var usr = bot.users.get("id", configs.maintainer);
                    if(usr) {
                        bot.sendMessage(usr, send + "\nReply with `update` in the next 30 minutes to apply changes and shut down");
                        updateconsole = true;
                        setTimeout(function() {
                            updateconsole = false;
                        }, 1800000);
                        return;
                    }
                }
                logMsg(new Date().getTime(), "WARN", "General", null, "Could not message bot maintainer about new updates");
            }
        } catch(error) {
            logMsg(new Date().getTime(), "ERROR", "General", null, "Failed to check for updates");
        }
    });
    
    setTimeout(checkVersion, 86400000);
}

// Command-line setup for empty fields
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});
function setup(i) {
    if(i<Object.keys(AuthDetails).length) {
        var key = Object.keys(AuthDetails)[i];
        if(!AuthDetails[key]) {
            rl.question("Enter " + key + ": ", function(input) {
                AuthDetails[key] = input;
                saveData("./auth.json", function(err) {
                    if(err) {
                        console.log("Error saving authentication details");
                        process.exit(1);
                    }
                    setup(i+1);
                });
            });
        } else {
            setup(i+1);
        }
    } else {
        switch(i) {
            case Object.keys(AuthDetails).length:
                if(!configs.maintainer && !configs.setup) {
                    rl.question("Enter your personal Discord ID or \".\" to skip: ", function(input) {
                        if(input==".") {
                            setup(i+1);
                        } else {
                            configs.maintainer = input;
                            saveData("./data/config.json", function(err) {
                                if(err) {
                                    console.log("Error saving configuration");
                                    process.exit(1);
                                }
                                readyToGo = true;
                                setup(i+3);
                            });
                        }
                    });
                } else {
                    setup(i+3);
                }
                break;
            case Object.keys(AuthDetails).length+1:
                if(!configs.hosting && !configs.setup) {
                    rl.question("Enter the web interface URL or \".\" to skip: ", function(input) {
                        if(input==".") {
                            setup(i+1);
                        } else {
                            configs.hosting = input;
                            saveData("./data/config.json", function(err) {
                                if(err) {
                                    console.log("Error saving configuration");
                                    process.exit(1);
                                }
                                setup(i+1);
                            });
                        }
                    });
                } else {
                    setup(i+2);
                }
                break;
            case Object.keys(AuthDetails).length+2:
                if(!configs.game && !configs.setup) {
                    rl.question("Enter bot game or \".\" to skip: ", function(input) {
                        if(input==".") {
                            setup(i+1);
                        } else {
                            configs.maintainer = input;
                            saveData("./data/config.json", function(err) {
                                if(err) {
                                    console.log("Error saving configuration");
                                    process.exit(1);
                                }
                                setup(i+1);
                            });
                        }
                    });
                } else {
                    setup(i+1);
                }
                break;
            default:
                rl.close();
                // Login to the bot's Discord account
                bot.login(AuthDetails.email, AuthDetails.password, function(loginError) {
                    if(loginError) {
                        console.log("Could not connect to Discord");
                        process.exit(1);
                    }
                    readyToGo = true;
                    configs.setup = true;
                    saveData("./data/config.json", function(err) {
                        if(err) {
                            console.log("Error saving configuration");
                            process.exit(1);
                        }
                    });
                });
                // Authenticate other modules
                imgur.setClientID(AuthDetails.imgur_client_id);
                wolfram = require("wolfram-node").init(AuthDetails.wolfram_app_id);
                unirest.get("https://openexchangerates.org/api/latest.json?app_id=" + AuthDetails.openexchangerates_app_id)
                .header("Accept", "application/json")
                .end(function(result) {
                    if(result.status==200) {
                        fx.rates = result.body.base;
                        fx.rates = result.body.rates;
                    }
                });
                break;
        }
    }
}
setup(0);
