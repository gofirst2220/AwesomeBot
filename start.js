// Get all the basic modules and files setup
const Discord = require("discord.js");
var botOn = {};
var version = "3.3-BETA";
var outOfDate = 0;
var configs = require("./config.json");
const AuthDetails = require("./auth.json");
var disconnects = 0;
var profileData = require("./profiles.json");
var stats = require("./stats.json");
var filter = require("./filter.json");
var readyToGo = false;

// Hijack console to display in web interface
var log = [];
(function() {
    var old = console.log;
    console.log = function(msg) {
        old.apply(this, arguments);
        log[log.length] = msg;
    }
})();

// Hijack spawn for auto-update to work properly
(function() {
    var childProcess = require("child_process");
    childProcess.spawn = require('cross-spawn');
})(); 

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

// Stuff for ongoing polls, trivia games, and admin console sessions
var polls = {};
var trivia = {};
var adminconsole = {};
var admintime = {};
var updateconsole = false;
var maintainerconsole = false;

// Misc. modules to make everything work
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
imgur.setClientID(AuthDetails.imgur_client_id);
const urban = require("urban");
const weather = require("weather-js");
const wolfram = require("wolfram-node").init(AuthDetails.wolfram_app_id);
const cheerio = require("cheerio");
const util = require("util");
const vm = require("vm");
const readline = require("readline");
const searcher = require("google-search-scraper");
const urlInfo = require("url-info-scraper");
const base64 = require("node-base64-image");

// List of possible greetings for new server members
var greetings = ["++ Welcome to our little corner of hell!", "++ has joined the server.", "++ You're gonna have a jolly good time here!", "++ is new here.", "++ is here, everybody!", "++ sends his/her regards.", "++, welcome to the server!", "++ is our next victim...", "Hello ++!", "Please welcome our newest member, ++"];

// List of bot commands along with usage and process for each
var commands = {
    // Checks if bot is alive and shows version and uptime
    "ping": {
        process: function(bot, msg) {
            var info = "Pong! " + bot.user.username + " v" + version + " running for " + secondsToString(bot.uptime/1000);
            if(configs.hosting!="") {
                info =  info.substring(0, info.length-1);
                info += ". Find out more at " + configs.hosting;
            }
            bot.sendMessage(msg.channel, info);
        }
    },
    // Shows top 5 games and active members
    "stats": {
        usage: "<(optional) clear>",
        process: function(bot, msg, suffix) {
            if(!stats[msg.channel.server.id]) {
                console.log(prettyDate(new Date()) + "[ERROR] Failed to read stats for " + msg.channel.server.name);
                bot.sendMessage(msg.channel, "Somehow, some way, I don't have any stats for this server :worried:");
                return;
            }
            
            var sortedMembers = [];
            for(var member in stats[msg.channel.server.id].members) {
                sortedMembers.push([member, stats[msg.channel.server.id].members[member].messages]);
            }
            sortedMembers.sort(function(a, b) {
                return a[1] - b[1];
            });
            var sortedGames = [];
            for(var game in stats[msg.channel.server.id].games) {
                sortedGames.push([game, stats[msg.channel.server.id].games[game]]);
            }
            sortedGames.sort(function(a, b) {
                return a[1] - b[1];
            });
            var sortedCommands = [];
            var commandSum = 0;
            for(var cmd in stats[msg.channel.server.id].commands) {
                commandSum += stats[msg.channel.server.id].commands[cmd];
                sortedCommands.push([cmd, stats[msg.channel.server.id].commands[cmd]]);
            }
            sortedCommands.sort(function(a, b) {
                return a[1] - b[1];
            });
            
            var info = "**" + msg.channel.server.name + " (this week)**\nMost active members:";
            for(var i=sortedMembers.length-1; i>sortedMembers.length-6; i--) {
                if(i<0) {
                    break;
                }
                if(i==sortedMembers.length-1 && sortedMembers[i][1]==0) {
                    info += "\n\t*Crickets*";
                    break;
                }
                var usr = msg.channel.server.members.get("id", sortedMembers[i][0]);
                if(usr && sortedMembers[i][1]>0) {
                    info += "\n\t" + usr.username + ": " + sortedMembers[i][1] + " messages";
                }
            }
            info += "\nMost-played games:";
            for(var i=sortedGames.length-1; i>sortedGames.length-6; i--) {
                if(i<0) {
                    break;
                }
                if(i==sortedGames.length-1 && sortedGames[i][1]==0) {
                    info += "\n\t*Maybe this isn't a gaming server...*";
                    break;
                }
                info += "\n\t" + sortedGames[i][0] + ": " + secondsToString(sortedGames[i][1] * 3000);
            }
            info += "\nCommand usage:";
            for(var i=sortedCommands.length-1; i>-1; i--) {
                if(sortedCommands[i][1]>0) {
                    var p = Math.floor(100 * sortedCommands[i][1] / commandSum);
                    info += "\n\t" + ("  " + p).substring(p.toString().length-1) + "% " + sortedCommands[i][0] + ": " + sortedCommands[i][1] + " uses";
                }
            }
            if(sortedCommands.length<1) {
                info += "\n\tI'm completely useless here *cries*";
            }
            bot.sendMessage(msg.channel, info);
            
            if(suffix.toLowerCase()=="clear" && configs.servers[msg.channel.server.id].admins.value.indexOf(msg.author.id)>-1) {
                clearServerStats(msg.channel.server.id);
                console.log(prettyDate(new Date()) + "[INFO] Cleared stats for " + msg.channel.server.name + " at admin's request");
            }
        }
    },
    // Searches Google for a given query
    "search": {
        usage: "<query> <count>",
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
                console.log(prettyDate(new Date()) + "[WARN] No search parameters in " + msg.channel.server.name);
                bot.sendMessage(msg.channel, msg.author + " ???");
            }
        }
    },
    // Fetches Twitter timelines and tweets
    "twitter": {
        usage: "<username> <count>",
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
                console.log(prettyDate(new Date()) + "[WARN] Twitter parameters not provided in " + msg.channel.server.name);
                bot.sendMessage(msg.channel, msg.author + " You confuse me.");
            }
        }
    },
    // Gets YouTube link with given keywords
    "youtube": {
        usage: "<video tags>",
        process: function(bot, msg, suffix) {
            if(!suffix) {
                console.log(prettyDate(new Date()) + "[WARN] User did not provide search term(s)");
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
                bot.sendMessage(msg.channel, suffix);
            }
        }
    },
    // Allows approved users (essentially bot admins) to change chatterbot engine
    "chatterbot": {
        usage: "<display or switch>",
        process: function(bot, msg, suffix) {
            if(configs.servers[msg.channel.server.id].admins.value.indexOf(msg.author.id)>-1) {
                var isSwitch = suffix.toLowerCase() === "switch";
                if (isSwitch) cleverOn[msg.channel.server.id] = !cleverOn[msg.channel.server.id];
                var using = !cleverOn[msg.channel.server.id] ? "Mitsuku" : "Cleverbot";
                
                if(isSwitch) {
                    console.log(prettyDate(new Date()) + "[INFO] Switched to " + using + " in " + msg.channel.server.name);
                    bot.sendMessage(msg.channel,"Now using " + using + " for conversations.");
                } else {
                    bot.sendMessage(msg.channel,"Currently using " + using + " for conversations.");
                }
            } else {
                console.log(prettyDate(new Date()) + "[WARN] User is not a bot admin");
                bot.sendMessage(msg.channel,msg.author + " Only my friends can do that.");
            }
        }
    },
    // Searches Google Images with keyword(s)
    "image": {
        usage: "<image tags>",
        process: function(bot, msg, suffix) {
            if(!suffix) {
                console.log(prettyDate(new Date()) + "[WARN] User did not provide search term(s)");
                bot.sendMessage(msg.channel, msg.author + " I don't know what image to get...");
                return;
            }
            giSearch(suffix, "", function(img) {
                if(!img) {
                    bot.sendMessage(msg.channel, "Couldn't find anything, sorry");
                } else {
                    imgur.upload(img, function(error, res) {
                        if(error) {
                            bot.sendMessage(msg.channel, img);
                        } else {
                            bot.sendMessage(msg.channel, res.data.link);
                        }
                    });
                }
            });
        }
    },
    // Get GIF from Giphy
    "gif": {
		usage: "<GIF tags>",
		process: function(bot, msg, suffix) {
            if(!suffix) {
                console.log(prettyDate(new Date()) + "[WARN] User did not provide search term(s)");
                bot.sendMessage(msg.channel, msg.author + " I don't know of a GIF for nothing.");
                return;
            }
		    var tags = suffix.split(" ");
            var rating = "pg-13";
            if(!configs.servers[msg.channel.server.id].nsfwfilter.value || !configs.servers[msg.channel.server.id].servermod.value) {
                rating = "r";
            }
		    getGIF(tags, function(id) {
                if(typeof id !== "undefined") {
                    bot.sendMessage(msg.channel, "http://media.giphy.com/media/" + id + "/giphy.gif");
                } else {
                    console.log(prettyDate(new Date()) + "[WARN] GIF not found for " + suffix);
                    bot.sendMessage(msg.channel, "The Internet has run out of memes :/");
                }
		    }, rating);
		}
	},
    // Defines word from Urban Dictionary
    "urban": {
        usage: "<term>",
        process: function(bot, msg, suffix) {
            var def = urban(suffix);
            def.first(function(data) {
                if(data) {
                    bot.sendMessage(msg.channel, "**" + suffix + "**: " + data.definition.replace("\r\n\r\n", "\n") + "\n*" + data.example.replace("\r\n\r\n", "\n") + "*\n`" + data.thumbs_up + " up, " + data.thumbs_down + " down`");
                } else {
                    console.log(prettyDate(new Date()) + "[WARN] Definition not found in " + msg.channel.server.name);
                    bot.sendMessage(msg.channel, "Wtf?! Urban Dictionary doesn't have an entry for " + suffix);
                }
            });
        }
    },
    // Queries Wolfram Alpha
    "wolfram" : {
        usage: "<Wolfram|Alpha query>",
        process(bot, msg, suffix) {
            if(!suffix) {
                console.log(prettyDate(new Date()) + "[WARN] User did not provide Wolfram|Alpha query in " + msg.channel.server.name);
                bot.sendMessage(msg.channel, msg.author + " I'm confused...");
                return;
            }
            wolfram.ask({query: suffix}, function(err, results) {
                if(err) {
                    console.log(prettyDate(new Date()) + "[ERROR] Unable to connect to Wolfram|Alpha");
                    bot.sendMessage(msg.channel, "Unfortunately, I didn't get anything back from Wolfram|Alpha");
                } else {
                    var info = ""
                    try {
                        for(var i=0; i<results.pod.length; i++) {
                            var fact = (results.pod[i].subpod[0].plaintext[0]) ? results.pod[i].subpod[0].plaintext[0] : results.pod[i].subpod[0].img[0].$.src;
                            info += "**" + results.pod[i].$.title + "**\n" + fact + "\n";
                        }
                        bot.sendMessage(msg.channel, info);
                    } catch(notFound) {
                        console.log(prettyDate(new Date()) + "[WARN] Could not find Wolfram|Alpha data for " + suffix + " in " + msg.channel.server.name);
                        bot.sendMessage(msg.channel, "Wolfram|Alpha has nothing.");
                    }
                }
            });
        }
    },
    // Gets Wikipedia article with given title
    "wiki": {
        usage: "<search terms>",
        process: function(bot, msg, suffix) {
            if(!suffix) {
                console.log(prettyDate(new Date()) + "[WARN] User did not provide search term(s) in " + msg.channel.server.name);
                bot.sendMessage(msg.channel, msg.author + " You need to provide a search term.");
                return;
            }
            new Wiki().search(suffix,1).then(function(data) {
                if(data.results.length==0) {
                    console.log(prettyDate(new Date()) + "[WARN] Wikipedia article not found for " + suffix);
                    bot.sendMessage(msg.channel, "I don't think Wikipedia has an article on that.");
                    return;
                }
                new Wiki().page(data.results[0]).then(function(page) {
                    page.summary().then(function(summary) {
                        if(summary.indexOf(" may refer to:") > -1 || summary.indexOf(" may stand for:") > -1) {
                            console.log(prettyDate(new Date()) + "[WARN] Ambiguous search term provided");
                            bot.sendMessage(msg.channel, "There are several matching Wikipedia articles; try making your query more specific.");
                        } else {
                            var sumText = summary.split('\n');
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
                console.log(prettyDate(new Date()) + "[ERROR] Unable to connect to Wikipedia");
                bot.sendMessage(msg.channel, "Uhhh...Something went wrong :(");
            });
        }
    },
    // Converts between units
    "convert": {
        usage: "<no.> <unit> to <unit>",
        process: function(bot, msg, suffix) {
            var toi = suffix.lastIndexOf(" to ");
            if(toi==-1) {
                console.log(prettyDate(new Date()) + "[WARN] User used incorrect syntax");
                bot.sendMessage(msg.channel, msg.author + " Sorry, I didn't get that. Make sure you're using the right syntax: `@" + bot.user.username + " <no.> <unit> to <unit>`");
            } else {
                try {
                    var num = suffix.substring(0, suffix.indexOf(" "));
                    var unit = suffix.substring(suffix.indexOf(" ")+1, suffix.lastIndexOf(" to ")).toLowerCase();
                    var end = suffix.substring(suffix.lastIndexOf(" ")+1).toLowerCase();
                    
                    if(isNaN(num)) {
                        console.log(prettyDate(new Date()) + "[WARN] User did not provide a numeric quantity");
                        bot.sendMessage(msg.channel, msg.author + " That's not a number...");
                        return;
                    }
                    if(convert().possibilities().indexOf(unit)!=-1) {
                        if(convert().from(unit).possibilities().indexOf(end)!=-1) {
                            bot.sendMessage(msg.channel, (Math.round(convert(num).from(unit).to(end) * 1000) / 1000) + " " + end);
                            return;
                        }
                    }
                    console.log(prettyDate(new Date()) + "[WARN] Unsupported unit(s)");
                    bot.sendMessage(msg.channel, msg.author + " I don't support that unit, try something else.");
                } catch(err) {
                    console.log(prettyDate(new Date()) + "[WARN] User used incorrect syntax");
                    bot.sendMessage(msg.channel, msg.author + " Are you sure you're using the correct syntax?");
                }
            }
        }
    },
    // Fetches stock symbol from Yahoo Finance
    "stock": {
        usage: "<stock symbol>",
        process: function(bot, msg, suffix) {
            if(!suffix) {
                console.log(prettyDate(new Date()) + "[WARN] User did not provide stock symbol");
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
                    console.log(prettyDate(new Date()) + "[WARN] Stock symbol " + suffix + " not found")
                    bot.sendMessage(msg.channel, "Sorry, I can't find that stock symbol.");
                }
            });
        }
    },
    // Displays the weather for an area
    "weather": {
        usage: "<location> <(optional) F or C>",
        process: function(bot, msg, suffix) {
            var unit = "F";
            var location = suffix;
            if([" F", " C"].indexOf(suffix.substring(suffix.length-2))>-1) {
                unit = suffix.charAt(suffix.length-1).toString();
                location = suffix.substring(0, suffix.length-2);
            }
            weather.find({search: location, degreeType: unit}, function(err, data) {
                if(err) {
                    console.log(prettyDate(new Date()) + "[WARN] Could not find location " + location + " in " + msg.channel.server.name);
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
        process: function(bot, msg, suffix) {
            if(configs.servers[msg.channel.server.id].admins.value.indexOf(msg.author.id)>-1 && suffix.toLowerCase()=="all") {
                for(var i=0; i<msg.channel.server.channels; i++) {
                    botOn[msg.channel.server.id][msg.channel.server.channels[i].id] = false;
                }
            } else if(configs.servers[msg.channel.server.id].admins.value.indexOf(msg.author.id)>-1) {
                botOn[msg.channel.server.id][msg.channel.id] = false;
            } else {
                console.log(prettyDate(new Date()) + "[WARN] User is not a bot admin");
                bot.sendMessage(msg.channel,msg.author + " Sorry, I won't listen to you :P");
                return;
            }
            bot.sendMessage(msg.channel, "Ok, I'll shut up.");
            console.log(prettyDate(new Date()) + "[INFO] Bot has been quieted by an admin in " + msg.channel.server.name);
        }
    },
    // Starts, ends, and answers live trivia game
    "trivia": {
        usage: "<start, end, next, or answer choice>",
        process: function(bot, msg, suffix) {
            var triviaOn = trivia[msg.channel.id]!=null;
            switch(suffix) {
                case "start":
                    if(!triviaOn) {
                        console.log(prettyDate(new Date()) + "[INFO] Trivia game started in " + msg.channel.name + ", " + msg.channel.server.name);
                        trivia[msg.channel.id] = {answer: "", attempts: 0, score: 0, possible: 0};
                        bot.sendMessage(msg.channel, "Welcome to **AwesomeTrivia**! Here's your first question: " + triviaQ(msg.channel.id) + "\nAnswer by tagging me like this: `@" + bot.user.username + " trivia <no. of choice>` or skip by doing this: `@" + bot.user.username + " trivia next`\nGood Luck!");
                        trivia[msg.channel.id].possible++;
                        if(!stats[msg.channel.server.id].commands.trivia) {
                            stats[msg.channel.server.id].commands.trivia = 0;
                        }
                        stats[msg.channel.server.id].commands.trivia++;
                    } else {
                        console.log(prettyDate(new Date()) + "[WARN] Ongoing trivia game in channel " + msg.channel.name + ", " + msg.channel.server.name);
                        bot.sendMessage(msg.channel, "There's a trivia game already in progress on this server, in " + msg.channel.name);
                    }
                    break;
                case "end":
                    if(triviaOn) {
                        var outof = trivia[msg.channel.id].possible-1;
                        if(trivia[msg.channel.id].possible==1) {
                            outof = 1;
                        }
                        console.log(prettyDate(new Date()) + "[INFO] Trivia game ended in " + msg.channel.name + ", " + msg.channel.server.name);
                        bot.sendMessage(msg.channel, "Thanks for playing! Y'all got " + trivia[msg.channel.id].score + " out of " + outof);
                        delete trivia[msg.channel.id];
                    } else {
                        console.log(prettyDate(new Date()) + "[WARN] No ongoing trivia game to end in " + msg.channel.name + ", " + msg.channel.server.name);
                        bot.sendMessage(msg.channel, "There isn't a trivia game going on right now. Start one by typing `@" + bot.user.username + " trivia start`");
                    }
                    break;
                case "next":
                    if(triviaOn) {
                        console.log(prettyDate(new Date()) + "[INFO] Trivia question skipped");
                        bot.sendMessage(msg.channel, "The answer was " + trivia[msg.channel.id].answer + "\n**Next Question:** " + triviaQ(msg.channel.id));
                        trivia[msg.channel.id].possible++;
                    } else {
                        console.log(prettyDate(new Date()) + "[WARN] No ongoing trivia game in which to skip question in " + msg.channel.name + ", " + msg.channel.server.name);
                        bot.sendMessage(msg.channel, "There isn't a trivia game going on right now. Start one by typing `@" + bot.user.username + " trivia start`");
                    }
                    break;
                default:
                    if(triviaOn) {
                        if(levenshtein.get(suffix.toLowerCase(), trivia[msg.channel.id].answer.toLowerCase())<3 && triviaOn) {
                            console.log(prettyDate(new Date()) + "[INFO] Correct trivia game answer in " + msg.channel.name + ", " + msg.channel.server.name);
                            bot.sendMessage(msg.channel, msg.author + " got it right! The answer is " + trivia[msg.channel.id].answer);
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
                        console.log(prettyDate(new Date()) + "[WARN] No ongoing trivia game to answer in " + msg.channel.name + ", " + msg.channel.server.name);
                        bot.sendMessage(msg.channel, "There isn't a trivia game going on right now. Start one by typing `@" + bot.user.username + " trivia start`");
                    }
            }
        }
    },
    // Sends reminders in given time for given note
    "remindme": {
        usage: "<no.> <h, m, or s> <note>",
        process: function(bot, msg, suffix) {
            var num, time, remind;
            if(suffix.indexOf("to ")==0) {
                suffix = suffix.substring(3);
                remind = suffix.substring(0, suffix.lastIndexOf(" in "));
                suffix = suffix.substring(suffix.lastIndexOf(" in ")+4);
                num = suffix;
                if(["h", "m", "s"].indexOf(num.charAt(num.length-1).toString().toLowerCase())!=-1) {
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
                if(["h", "m", "s"].indexOf(num.charAt(num.length-1).toString().toLowerCase())!=-1) {
                    time = num.charAt(num.length-1).toString().toLowerCase();
                    num = num.substring(0, num.length-1);
                } else {
                    time = suffix.substring(0, suffix.indexOf(" ")).toLowerCase();
                    suffix = suffix.substring(suffix.indexOf(" ")+1);
                }
                remind = suffix;
            }

            if(isNaN(num) || ["h", "m", "s"].indexOf(time)==-1 || remind=="") {
                bot.sendMessage(msg.channel, msg.author + " Sorry, I don't know what that means. Make sure you're using the syntax `@" + bot.user.username + " <no.> <h, m, or s> <note>`");
                return;
            } else if(num<0) {
                bot.sendMessage(msg.channel, msg.author + " Uh...Why don't you check that again?");
            }
            console.log(prettyDate(new Date()) + "[INFO] Reminder set by " + msg.author + " in " + num + time);
            bot.sendMessage(msg.channel, msg.author + " OK, I'll send you a PM in " + num + time.toLowerCase());
            
            var countdown = 0;
            switch(time) {
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
            setTimeout(function() {
                bot.sendMessage(msg.author, "**Reminder:** " + remind);
                console.log(prettyDate(new Date()) + "[INFO] Reminded user " + msg.author);
            }, countdown);
        }
    },
    // Gets top (max 4) posts in given subreddit, sorting hot, includes pinned
    "reddit": {
        usage: "<subreddit> <count>",
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
                            console.log(prettyDate(new Date()) + "[WARN] Subreddit not found or Reddit unavailable");
                            bot.sendMessage(msg.channel, "Surprisingly, I couldn't find anything in " + sub + " on reddit.");
                            return;
                        } else if(data[i].data.over_18 && configs.servers[msg.channel.server.id].admins.value.indexOf(msg.author.id)==-1 && configs.servers[msg.channel.server.id].nsfwfilter.value && configs.servers[msg.channel.server.id].servermod.value) {
                            console.log(prettyDate(new Date()) + "[INFO] Handling filtered query from " + msg.author.username);
                            kickUser(msg, "is abusing the bot", "attempting to fetch NSFW content");
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
                    console.log(prettyDate(new Date()) + "[WARN] Subreddit not found or Reddit unavailable");
                    bot.sendMessage(msg.channel, "Surprisingly, I couldn't find anything in " + sub + " on reddit.");
                }
            });
        }
    },
    // Gets top (max 4) posts in given RSS feed name 
    "rss": {
        usage: "<site> <count>",
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
                    console.log(prettyDate(new Date()) + "[WARN] Feed " + site + " not found");
                    bot.sendMessage(msg.channel, msg.author + " Feed not found.");
                }
            }
        }
    },
    // Generates a random number
    "roll": {
        usage: "<max no. inclusive>",
        process: function(bot, msg, suffix) {
            if(!suffix || suffix=="null" || isNaN(suffix) || suffix < 1) {
                console.log(prettyDate(new Date()) + "[WARN] User provided nonsensical parameter");
                bot.sendMessage(msg.channel, msg.author + " Wut.");
                return;
            }
            if(suffix) {
                bot.sendMessage(msg.channel, msg.author + " rolled a " + getRandomInt(0, suffix));
            } else {
                bot.sendMessage(msg.channel, msg.author + " rolled a " + getRandomInt(0, 6));
            }
        }
    },
    // Show list of games being played
    "games": {
        process: function(bot, msg) {
            var games = {};
            for(var i=0; i<msg.channel.server.members.length; i++) {
                if(msg.channel.server.members[i].game && msg.channel.server.members[i].status!="offline") {
                    if(!games[msg.channel.server.members[i].game.name]) {
                        games[msg.channel.server.members[i].game.name] = [];
                    }
                    games[msg.channel.server.members[i].game.name][games[msg.channel.server.members[i].game.name].length] = msg.channel.server.members[i].username;
                }
            }
            var info = "";
            for(var game in games) {
                info += "**" + game + "** (" + games[game].length + ")";
                for(var i=0; i<games[game].length; i++) {
                    info += "\n\t" + games[game][i];
                }
                info += "\n";
            }
            bot.sendMessage(msg.channel, info);
        }
    },
    // Get a user's full profile
    "profile": {
        usage: "<username>",
        process: function(bot, msg, suffix) {
            var usr = msg.channel.server.members.get("username", suffix);
            if(!suffix) {
                usr = msg.author;
            } else if(suffix.charAt(0)=='<') {
                usr = msg.channel.server.members.get("id", suffix.substring(2, suffix.length-1));
            }
            if(usr) {
                var info = "**User Profile: " + usr + "**\n\tID: " + usr.id + "\n\tStatus: " + usr.status + "\n\tAvatar: ";
                var avatar = "";
                if(usr.avatarURL) {
                    avatar = usr.avatarURL;
                } else {
                    avatar = "http://i.imgur.com/fU70HJK.png";
                }
                imgur.upload(avatar, function(error, res) {
                    if(error) {
                        info += usr.avatarURL;
                    } else {
                        info += res.data.link;
                    }
                    if(usr.game) {
                        info += "\n\tPlaying " + usr.game.name;
                    }
                    if(profileData[msg.author.id]) {
                        for(var field in profileData[msg.author.id]) {
                            info += "\n\t" + field.charAt(0).toUpperCase() + field.slice(1) + ": " + profileData[msg.author.id][field];
                        }
                    }
                    var details = msg.channel.server.detailsOfUser(usr);
                    if(details) {
                        info += "\n**On " + msg.channel.server.name + "**";
                        if(details.roles.length>0) {
                            info += "\n\tRoles: " + details.roles[0].name;
                            for(var i=1; i<details.roles.length; i++) {
                                info += ", " + details.roles[i].name;
                            }
                        }
                        var joined = prettyDate(new Date(details.joinedAt));
                        info += "\n\tJoined: " + joined.substring(1, joined.length-2);
                        if(usr.status!="online" && configs.servers[msg.channel.server.id].stats.value) {
                            var seen = prettyDate(new Date(stats[msg.channel.server.id].members[msg.author.id].seen));
                            info += "\n\tLast seen: " + seen.substring(1, seen.length-2);
                        }
                    }
                    bot.sendMessage(msg.channel, info);
                });
            } else {
                console.log(prettyDate(new Date()) + "[WARN] Requested member does not exist");
                bot.sendMessage(msg.channel, "That user doesn't exist :/");
            }
        }
    },
    // Displays list of options and RSS feeds
    "help": {
        process: function(bot, msg) {
            bot.sendMessage(msg.channel, "Tag me then state one of the following commands:" + getHelp(msg.channel.server));
        }
    }
};

// Fetches posts from RSS feeds listed in config.json
function rssfeed(bot, msg, url, count, full) {
    if(count > 4 || !count || count=="" || count=="null") {
        count = 4;
    }
    var FeedParser = require("feedparser");
    var feedparser = new FeedParser();
    request(url).pipe(feedparser);
    feedparser.on('error', function(error){
        console.log(prettyDate(new Date()) + "[ERROR] Failed to read requested feed.");
        bot.sendMessage(msg.channel, "Failed to read feed. Sorry.");
    });
    var shown = 0;
    feedparser.on('readable', function() {
        var stream = this;
        shown += 1
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
var bot = new Discord.Client();
bot.on("ready", function() {
    checkVersion();
    
    // Make sure servers are properly configured and set variables
    for(var i=0; i<bot.servers.length; i++) {
        bot.startTyping(bot.servers[i].defaultChannel);
        // Populate stats file
        if(!stats[bot.servers[i].id]) {
            stats[bot.servers[i].id] = {members: {}, games: {}, commands: {}};
            console.log(prettyDate(new Date()) + "[INFO] Created stats for " + bot.servers[i].name);
        }
        for(var j=0; j<bot.servers[i].members.length; j++) {
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
        }
        // Configure new servers
        if(!configs.servers[bot.servers[i].id]) {
            defaultConfig(bot.servers[i]);
        }
        // Make sure config.json is up-to-date
        checkConfig(bot.servers[i]);
        // Set runtime values
        cleverOn[bot.servers[i].id] = true;
        spams[bot.servers[i].id] = {};
        botOn[bot.servers[i].id] = {};
        // Turn on bot
        for(var j=0; j<bot.servers[i].channels.length; j++) {
            botOn[bot.servers[i].id][bot.servers[i].channels[j].id] = true;
        }
        // Run timer extensions
        runTimerExtensions();
        // Send hello message
        bot.sendMessage(bot.servers[i].defaultChannel, "*I am " + bot.user.username + " v" + version + " by @anandroiduser, https://git.io/v2e1w*");
        bot.stopTyping(bot.servers[i].defaultChannel);
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

    // Set up webserver for online bot status, optimized for RedHat OpenShift deployment
    var http = require("http");
    var server_port = process.env.OPENSHIFT_NODEJS_PORT || 8080;
    var server_ip_address = process.env.OPENSHIFT_NODEJS_IP || '127.0.0.1';
    var server = http.createServer(function(request, response) {
        if(request.method=="GET") {
            response.setHeader('Content-Type', 'text/html');
            response.writeHead(200);
            var html = "";
            try {
                html = "<html><head><title>" + bot.user.username + "</title><script type='text/javascript'>function invertColors() {if(document.body.style.backgroundColor=='black') {document.body.style.backgroundColor='white';document.body.style.color='black';} else {document.body.style.backgroundColor='black';document.body.style.color='white';}}</script></head><body onload='javascript:document.getElementById(\"console\").scrollTop = document.getElementById(\"console\").scrollHeight;'><span style='font-family: \"Arial\"; margin-bottom: 0px;'><span style='font-size: 28;'><b>" + bot.user.username + "</b> Info</span><p><span style='font-size: 20;'><u>Statistics</u></span><br><b>Status:</b> Online<br><b>Bot ID:</b> " + bot.user.id + "<br><b>Version:</b> v" + version + "<br><b>Uptime:</b> " + secondsToString(bot.uptime/1000) + "<br><b>Disconnections:</b> " + disconnects + " so far<p></span><span style='font-size: 20;'><u>Servers</u><br></span><i>Number of messages only includes the past 24 hours.</i>";
                for(var svrid in messages) {
                    var svr = bot.servers.get("id", svrid);
                    if(svr) {
                        var online = 0;
                        html += "<br><b>" + svr.name + ":</b> " + messages[svrid] + " messages, ";
                        for(var i=0; i<svr.members.length; i++) {
                            if(svr.members[i].status!="offline") {
                                online++;
                            }
                        }
                        html += online + " members online";
                    }
                }
                html += "<p><span style='font-size: 20; margin-bottom: 0px;'><u>Activity Log</u></span></span><div id='console' style='font-family: \"Consolas\", \"Droid Sans Mono\"; height: 50%; margin: 0; padding: 5px; overflow: scroll; overflow-x: hidden; border: 1px solid gray;'>";
                for(var i=0; i<log.length; i++) {
                    html += log[i] + "<br>";
                }
                html += "</div><br><button onclick='javascript:location.reload()'>Refresh</button>&nbsp;<button onclick='javascript:invertColors();'>Toggle Colors</button><br><br><i>Created by @anandroiduser, <a href='https://git.io/v2e1w'>https://git.io/v2e1w</a></i></body></html>";
            } catch(err) {
                console.log(prettyDate(new Date()) + "[ERROR] Failed to write web interface");
                html = bot.user.username + " v" + version + " running for " + secondsToString(bot.uptime/1000);
            }
            response.end(html);
        }
    });
    server.listen(server_port, server_ip_address, function() {
        console.log(prettyDate(new Date()) + "[INFO] Opened web interface on " + server_ip_address + ", server port " + server_port)
    });
    
    // Ready to go!
	console.log(prettyDate(new Date()) + "[INFO] Connected, serving in " + bot.channels.length + " channels");
});

bot.on("message", function (msg, user) {
    try {
        // Stuff that only applies to PMs
        if(msg.channel.isPrivate && msg.author.id!=bot.user.id) {
            // Ensure that message is not from another AwesomeBot
            if(msg.content.indexOf("You can interact with me in any of the channels by tagging me with")>-1) {
                for(var i=0; i<bot.servers.length; i++) {
                    if(bot.servers[i].members.get("id", msg.author.id)) {
                        setTimeout(function() {
                            configs.servers[bot.servers[i].id].blocked.value[configs.servers[bot.servers[i].id].blocked.value.length] = msg.author.id;
                        }, 1000);
                    }
                }
            }
            
            // Update command from maintainer
            if(updateconsole && msg.author.id==configs.maintainer && msg.content=="update") {
                console.log(prettyDate(new Date()) + "[INFO] Updating " + bot.user.username + ":");
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
                    var checkout = spawn("git", ["checkout","--", "start.js", "package.json"]);
                    checkout.stdout.on("data", function(data) {
                        console.log(data.toString());
                    });
                    checkout.on("close", function(code) {
                        console.log("Done with the git stuff, but this might not work");
                        var npm = spawn("npm", ["install"]);
                        npm.stdout.on("data", function(data) {
                            console.log(data.toString());
                        });
                        npm.on("close", function(code) {
                            console.log(prettyDate(new Date()) + "[INFO] Successfully updated");
                            bot.sendMessage(msg.channel, "Done! Shutting down...", function() {
                                bot.logout(function() {
                                    process.exit(1);
                                });
                            });
                        });
                    });
                });
                console.log(prettyDate(new Date()) + "[ERROR] Could not update " + bot.user.username);
                bot.sendMessage(msg.channel, "Something went wrong, could not update.");
            }
            
            // Maintiner control panel for overall bot things
            if(msg.author.id==configs.maintainer && msg.content.toLowerCase()==("config")) {
                console.log(prettyDate(new Date()) + "[INFO] Maintainer console opened");
                bot.sendMessage(msg.channel, "**Welcome to the " + bot.user.username + " maintainer console.** I am your owner. I will do what you say. Here are your options:\n\tquit\n\tgame <name of game or `.` to remove>\n\tusername <new name>\n\tavatar <URL of new profile pic>\n\tstatus <online or idle>\nUse the syntax `<option> <parameter>` as always! :)");
                maintainerconsole = true;
                return;
            } else if(msg.author.id==configs.maintainer && maintainerconsole) {
                var n = "";
                var suffix = "";
                if(msg.content.indexOf(" ")>-1) {
                    n = msg.content.substring(0, msg.content.indexOf(" ")).toLowerCase();
                    suffix = msg.content.substring(msg.content.indexOf(" ")+1);
                } else {
                    n = msg.content.toLowerCase();
                }
                if(!n || ["quit", "game", "username", "avatar", "status"].indexOf(n)==-1) {
                    console.log(prettyDate(new Date()) + "[WARN] Maintainer provided invalid option in console");
                    bot.sendMessage(msg.channel, "Invalid option, please see list above.");
                    return;
                } else if((!suffix && ["game", "username", "avatar", "status"].indexOf(msg.content)>-1) || (n=="status" && ["online", "idle"].indexOf(suffix)==-1)) {
                    console.log(prettyDate(new Date()) + "[WARN] Maintainer provided invalid parameters in console");
                    bot.sendMessage(msg.channel, "Missing or incorrect parameter");
                    return;
                }
                
                switch(n) {
                    case "quit":
                        console.log(prettyDate(new Date()) + "[INFO] Closed maintainer console");
                        bot.sendMessage(msg.channel, "Goodbye, master.");
                        maintainerconsole = false;
                        break;
                    case "game":
                        bot.setStatus("online", suffix);
                        if(suffix==".") {
                            suffix = "";
                            bot.setStatus("online", null);
                        }
                        console.log(prettyDate(new Date()) + "[INFO] Set bot game to \"" + suffix + "\"");
                        configs.game = suffix;
                        saveData("./config.json", function(err) {
                            if(err) {
                                console.log(prettyDate(new Date()) + "[ERROR] Could not save new config");
                                bot.sendMessage(msg.channel, "An unknown error occurred *saving* that change :crying_cat_face:");
                            } else {
                                bot.sendMessage(msg.channel, suffix=="" ? "Ok, removed game from status" : ("Ok, now I'm playing `" + suffix + "`"));
                            }
                        });
                        break;
                    case "username":
                        bot.sendMessage(msg.channel, "Due to an issue with Discord.JS, changing the bot username is not supported at this time. Hopefully this can be re-enabled in a future update.");
                        /*bot.setUsername(suffix, function(err) {
                            if(err) {
                                console.log(prettyDate(new Date()) + "[ERROR] Failed to change username to " + suffix);
                                bot.sendMessage(msg.channel, "Uh-oh, something went wrong :o");
                            } else {
                                console.log(prettyDate(new Date()) + "[INFO] Changed bot username to " + suffix);
                                bot.sendMessage(msg.channel, "Done!");
                            }
                        });*/
                        break;
                    case "avatar":
                        bot.sendMessage(msg.channel, "Due to an issue with Discord.JS, changing the bot avatar is not supported at this time. Hopefully this can be re-enabled in a future update.");
                        /*base64.base64encoder(suffix, {string: true}, function(error, image) {
                            if(error) {
                                console.log(prettyDate(new Date()) + "[WARN] Could not parse maintainer's avatar image");
                                bot.sendMessage(msg.channel, "That doesn't seem to be an image...");
                            }
                            bot.updateDetails({avatar: image}, function(err) {
                                if(err) {
                                    console.log(prettyDate(new Date()) + "[ERROR] Failed to change avatar to " + suffix);
                                    bot.sendMessage(msg.channel, "My face!!!!!!111 :(");
                                } else {
                                    console.log(prettyDate(new Date()) + "[INFO] Changed bot avatar to " + suffix);
                                    bot.sendMessage(msg.channel, "I like this one :D");
                                }
                            });
                        });*/
                        break;
                    case "status":
                        bot.setStatus(suffix, function(err) {
                            if(err) {
                                console.log(prettyDate(new Date()) + "[ERROR] Failed to change status to " + suffix);
                                bot.sendMessage(msg.channel, "Discord is being weird, try again later");
                            } else {
                                console.log(prettyDate(new Date()) + "[INFO] Changed bot status to " + suffix);
                                bot.sendMessage(msg.channel, "Ok, I am now `" + suffix + "`");
                            }
                        });
                        break;
                }
                return;
            }
            
            // Admin control panel, check to make sure we're on PM and config command was valid
            if(msg.content.indexOf("config ")>-1 && msg.content.length>7 && !adminconsole[msg.author.id]) {
                var svr = bot.servers.get("name", msg.content.substring(msg.content.indexOf(" ")+1));
                // Check if specified server exists
                if(!svr) {
                    console.log(prettyDate(new Date()) + "[WARN] User " + msg.author.username + " provided invalid server for admin console");
                    bot.sendMessage(msg.channel, "Sorry, invalid server. Try again?");
                // Check if sender is an admin of the specified server
                } else if(configs.servers[svr.id].admins.value.indexOf(msg.author.id)>-1) {
                    // Check to make sure no one is already using the console
                    if(!activeAdmins(svr.id)) {
                        // Ok, all conditions met, logged into admin console
                        adminconsole[msg.author.id] = svr.id;
                        console.log(prettyDate(new Date()) + "[INFO] Admin wizard launched by " + msg.author.username + " for " + svr.name);
                        
                        // Display options for the admin
                        var info = "Welcome to the admin console for server " + svr.name + ". Your options are:";
                        info += "\n\tquit";
                        for(var i=0; i<Object.keys(configs.servers[svr.id]).length; i++) {
                            if(Object.keys(configs.servers[svr.id])[i]!="extensions") {
                                info += "\n\t" + Object.keys(configs.servers[svr.id])[i] + " " + configs.servers[svr.id][Object.keys(configs.servers[svr.id])[i]].option;
                            }
                        }
                        info += "\n\tclean <channel name> <number of messages>"
                        info += "\n\tleave *remove bot from server*";
                        info += "\n\tclose *ongoing trivia/polls*";
                        info += "\n\textension <name of extension to delete>"
                        info += "\n\tlist *current configs*";
                        info += "\nUse the syntax `<option> <parameter(s)>`, or PM me a JSON file to set up an extension (to learn more about this, go to https://git.io/v2UGr)";
                        bot.sendMessage(msg.channel, info);
                        admintime[msg.author.id] = setTimeout(function() {
                            if(adminconsole[msg.author.id]) {
                                console.log(prettyDate(new Date()) + "[INFO] Timeout on " + msg.author.username + "'s admin console session for " + svr.name);
                                delete adminconsole[msg.author.id];
                                bot.sendMessage(msg.channel, "It's been 3 minutes, so I'm assuming you're done here. Goodbye!");
                            }
                        }, 180000);
                    } else {
                        console.log(prettyDate(new Date()) + "[WARN] Admin console for " + svr.name + " already active");
                        bot.sendMessage(msg.channel, "Another admin is in the console already. Please try again later.");
                    }
                } else {
                    console.log(prettyDate(new Date()) + "[WARN] User " + msg.author.username + " is not a bot admin of " + svr.name);
                    bot.sendMessage(msg.channel, "You are not an admin for that server.");
                }
                return;
            // Check if this is an admin command
            } else if(adminconsole[msg.author.id]) {
                clearTimeout(admintime[msg.author.id]);
                admintime[msg.author.id] = setTimeout(function() {
                    if(adminconsole[msg.author.id]) {
                        console.log(prettyDate(new Date()) + "[INFO] Timeout on " + msg.author.username + "'s admin console session for " + svr.name);
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
                            var validity;
                            if(!extension.name || !extension.type || !extension.key || !extension.process) {
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
                                console.log(prettyDate(new Date()) + "[WARN] Extension by " + msg.author.username + " is invalid: " +  validity);
                                bot.sendMessage(msg.channel, "Well, that didn't work. Here's the error: `" + validity + "`");
                            } else {
                                configs.servers[svr.id].extensions[extension.name] = extension;
                                if(extension.type=="timer") {
                                    runTimerExtension(svr.id, extension.name);
                                }
                                console.log(prettyDate(new Date()) + "[INFO] Extension " + extension.name + " added to server " + svr.name);
                                delete configs.servers[svr.id].extensions[extension.name].name;
                                saveData("./config.json", function(err) {
                                    if(err) {
                                        console.log(prettyDate(new Date()) + "[ERROR] Could not save new config for " + svr.name);
                                        bot.sendMessage(msg.channel, "An unknown error occurred, but at least *your* code was fine");
                                    } else {
                                        var info = "Great, it works! You can use this extension on the server now.\nUpdated extension list:";
                                        for(var ext in configs.servers[svr.id].extensions) {
                                            info += "\n\t" + ext + ", " + configs.servers[svr.id].extensions[ext].type;
                                        }
                                        bot.sendMessage(msg.channel, info);
                                    }
                                });
                            }
                        } catch(error) {
                            console.log(prettyDate(new Date()) + "[WARN] Invalid extension file provided by " + msg.author.username);
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
                    if((Object.keys(configs.servers[svr.id]).indexOf(n)==-1 && ["quit", "clean", "leave", "close", "extension", "list"].indexOf(n)==-1) || n=="extensions") {
                        console.log(prettyDate(new Date()) + "[WARN] " + msg.author.username + " provided an invalid admin console option");
                        bot.sendMessage(msg.channel, "Invalid option, try again.");
                        return;
                    }
                    if(suffix=="" && ["quit", "remove", "leave", "close", "list"].indexOf(n)==-1) {
                        console.log(prettyDate(new Date()) + "[WARN] " + msg.author.username + " did not provide a parameter for option " + n);
                        bot.sendMessage(msg.channel, "Missing parameter. Please see your options above.");
                        return;
                    }
                    
                    // Do different things based on n
                    switch(n) {
                        // Exit admin console
                        case "quit":
                            delete adminconsole[msg.author.id];
                            bot.sendMessage(msg.channel, "Goodbye!");
                            console.log(prettyDate(new Date()) + "[INFO] Admin wizard for " + svr.name + " closed");
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
                                console.log(prettyDate(new Date()) + "[WARN] Member not found for admin list in " + svr.name);
                                bot.sendMessage(msg.channel, "Sorry, no such user.");
                                return;
                            } else if(configs.servers[svr.id].admins.value.indexOf(usr.id)>0) {
                                console.log(prettyDate(new Date()) + "[INFO] Removed " + usr.username + " as a bot admin in " + svr.name);
                                configs.servers[svr.id].admins.value.splice(configs.servers[svr.id].admins.value.indexOf(usr.id), 1);
                                info += usr.username + " is no longer a server admin.";
                            } else {
                                console.log(prettyDate(new Date()) + "[INFO] Added " + usr.username + " as a bot admin in " + svr.name);
                                configs.servers[svr.id].admins.value[configs.servers[svr.id].admins.value.length] = usr.id;
                                info += usr.username + " is now a server admin.";
                            }
                            info += "\nUpdated admins list for this server:";
                            for(var i=0; i<configs.servers[svr.id].admins.value.length; i++) {
                                info += "\n\t" + bot.users.get("id", configs.servers[svr.id].admins.value[i]).username + ", ID " + configs.servers[svr.id].admins.value[i];
                            }
                            saveData("./config.json", function(err) {
                                if(err) {
                                    console.log(prettyDate(new Date()) + "[ERROR] Could not save new config for " + svr.name);
                                    bot.sendMessage(msg.channel, "An unknown error occurred.");
                                } else {
                                    bot.sendMessage(msg.channel, info);
                                }
                            });
                            break;
                        // Block/unblock users
                        case "blocked":
                            if(isNaN(suffix)) {
                                var usr = svr.members.get("username", suffix);
                            } else {
                                var usr = svr.members.get("id", suffix);
                            }
                            var info = "";
                            if(!usr) {
                                console.log(prettyDate(new Date()) + "[WARN] Member not found to block in " + svr.name);
                                bot.sendMessage(msg.channel, "Sorry, no such user.");
                                return;
                            } else if(configs.servers[svr.id].blocked.value.indexOf(usr.id)>-1) {
                                console.log(prettyDate(new Date()) + "[INFO] Unblocked " + usr.username + " in " + svr.name);
                                configs.servers[svr.id].blocked.value.splice(configs.servers[svr.id].blocked.value.indexOf(usr.id), 1);
                                info += "Removed user " + usr.username + " from blocked list.";
                            } else {
                                if(configs.servers[svr.id].blocked.value.indexOf(usr.id)>-1) {
                                    console.log(prettyDate(new Date()) + "[WARN] " + usr.username + " cannot block another bot admin in " + svr.name);
                                    bot.sendMessage(msg.channel, "You can't block other bot admins in the server. That would be mean.");
                                } else if(usr.id == msg.author.id) {
                                    console.log(prettyDate(new Date()) + "[WARN] " + usr.username + " cannot block themselves in " + svr.name);
                                    bot.sendMessage(msg.channel, "You can't block yourself! Lol");
                                } else {
                                    console.log(prettyDate(new Date()) + "[INFO] Blocked " + usr.username + " in " + svr.name);
                                    configs.servers[svr.id].blocked.value[configs.servers[svr.id].blocked.value.length] = usr.id;
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
                            saveData("./config.json", function(err) {
                                if(err) {
                                    console.log(prettyDate(new Date()) + "[ERROR] Could not save new config for " + svr.name);
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
                            saveData("./config.json", function(err) {
                                if(err) {
                                    console.log(prettyDate(new Date()) + "[ERROR] Could not save new config for " + svr.name);
                                    bot.sendMessage(msg.channel, "An unknown error occurred.");
                                } else {
                                    console.log(prettyDate(new Date()) + "[INFO] New greeting in " + svr.name + ": " + suffix);
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
                                console.log(prettyDate(new Date()) + "[INFO] Command " + n + " turned " + yn + " in " + svr.name);
                            } else if(suffix.indexOf(" ")>-1) {
                                var url = suffix.substring(0, suffix.indexOf(" "));
                                var nm = suffix.substring(suffix.indexOf(" ")+1);
                                if(nm.indexOf(" ")>-1) {
                                    console.log(prettyDate(new Date()) + "[WARN] Invalid feed name provided in admin console for " + svr.name);
                                    info += "Invalid feed name.";
                                } else {
                                    configs.servers[svr.id].rss.value[1][configs.servers[svr.id].rss.value[1].length] = url;
                                    configs.servers[svr.id].rss.value[2][configs.servers[svr.id].rss.value[2].length] = nm;
                                    console.log(prettyDate(new Date()) + "[INFO] Feed " + nm + " added in " + svr.name);
                                    info += "Feed " + nm + " added.";
                                }
                            } else {
                                if(configs.servers[svr.id].rss.value[2].indexOf(suffix)>-1) {
                                    configs.servers[svr.id].rss.value[1].splice(configs.servers[svr.id].rss.value[2].indexOf(suffix), 1);
                                    configs.servers[svr.id].rss.value[2].splice(configs.servers[svr.id].rss.value[2].indexOf(suffix), 1);
                                    console.log(prettyDate(new Date()) + "[INFO] Feed " + suffix + " removed in " + svr.name);
                                    info += "Removed feed " + suffix;
                                } else {
                                    info += "No matching feed found.";
                                }
                            }
                            saveData("./config.json", function(err) {
                                if(err) {
                                    console.log(prettyDate(new Date()) + "[ERROR] Could not save new config for " + svr.name);
                                    bot.sendMessage(msg.channel, "There was an error saving your changes.");
                                } else {
                                    bot.sendMessage(msg.channel, info);
                                }
                            });
                            break;
                        // Clean past messages
                        case "clean":
                            if(suffix.indexOf(" ")==-1) {
                                console.log(prettyDate(new Date()) + "[WARN] " + msg.author.username + " did not provide a parameter for option " + n);
                                bot.sendMessage(msg.channel, "Missing parameter. Make sure to include the number of messages to delete *and* the channel name.");
                                return;
                            }
                            var ch = svr.channels.get("name", suffix.substring(0, suffix.indexOf(" ")));
                            var count = suffix.substring(suffix.indexOf(" ")+1);
                            if(isNaN(count) || !ch) {
                                console.log(prettyDate(new Date()) + "[WARN] " + msg.author.username + " provided incorrect parameter(s) for option " + count);
                                bot.sendMessage(msg.channel, "You've made a terrible mistake! Something's wrong with your command...");
                                return;
                            }
                            cleanMessages(msg.channel, ch, count, null);
                            break;
                        // Server management
                        case "leave":
                            bot.leaveServer(svr, function(error) {
                                if(error) {
                                    console.log(prettyDate(new Date()) + "[ERROR] Failed to leave server " + svr.name);
                                    bot.sendMessage(msg.channel, "Failed to leave server.");
                                } else {
                                    delete configs.servers[svr.id];
                                    delete messages[svr.id];
                                    delete cleverOn[svr.id];
                                    console.log(prettyDate(new Date()) + "[INFO] Left server " + svr.name);
                                    bot.sendMessage(msg.channel, bot.user.username + " has left " + svr.name);
                                }
                            });
                            break;
                        // Close polls and trivia games by force
                        case "close":
                            for(var i=0; i<svr.channels.length; i++) {
                                if(trivia[svr.channels[i].id]) {
                                    bot.sendMessage(svr.channels[i], "Sorry to interrupt your game, but an admin has closed this trivia session.");
                                    commands["trivia"].process(bot, {"channel": svr.channels[i]}, "end");
                                    console.log(prettyDate(new Date()) + "[INFO] Closed trivia game in " + svr.channels[i].name + ", " + svr.name);
                                    delete trivia[svr.channels[i].id];
                                    bot.sendMessage(msg.channel, "Closed a trivia game in " + svr.channels[i].name);
                                }
                                var act = activePolls(svr.channels[i].id);
                                if(act) {
                                    bot.sendMessage(svr.channels[i], "The ongoing poll in this channel has been closed by an admin.");
                                    bot.sendMessage(svr.channels[i], pollResults(act, "The results are in", "and the winner is"));
                                    console.log(prettyDate(new Date()) + "[INFO] Closed active poll in " + svr.channels[i].name + ", " + svr.name);
                                    delete polls[act];
                                    bot.sendMessage(msg.channel, "Closed a poll in " + svr.channels[i].name);
                                }
                            }
                            break;
                        // Delete an extension
                        case "extension":
                            if(configs.servers[svr.id].extensions[suffix]) {
                                delete configs.servers[svr.id].extensions[suffix];
                                console.log(prettyDate(new Date()) + "[INFO] Deleted extension " + suffix + " from " + svr.name);
                                var info = "Deleted extension " + suffix + " from this server.\nUpdated extension list:";
                                for(var ext in configs.servers[svr.id].extensions) {
                                    info += "\n\t" + ext + ", " + configs.servers[svr.id].extensions[ext].type;
                                }
                            } else {
                                console.log(prettyDate(new Date()) + "[WARN] Extension " + suffix + " not found in " + svr.name);
                                bot.sendMessage(msg.channel, "Extension " + suffix + " isn't on this server.");
                            }
                            saveData("./config.json", function(err) {
                                if(err) {
                                    console.log(prettyDate(new Date()) + "[ERROR] Could not save new config for " + svr.name);
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
                                console.log(prettyDate(new Date()) + "[WARN] Invalid parameter provided for admin console in " + svr.name);
                                bot.sendMessage(msg.channel, "Invalid parameter, must be `y` or `n`.");
                                return;
                            }
                            console.log(prettyDate(new Date()) + "[INFO] Command " + n + " turned " + yn + " in " + svr.name);
                            saveData("./config.json", function(err) {
                                if(err) {
                                    console.log(prettyDate(new Date()) + "[ERROR] Could not save new config for " + svr.name);
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
            
            // Add information to user profile
            if(msg.content.indexOf("profile ")==0) {
                if(msg.content.indexOf(",")==-1) {
                    console.log(prettyDate(new Date()) + "[WARN] User " + msg.author.username + " did not specify parameters for profile data");
                    bot.sendMessage(msg.channel, "Please include the name of the value as well as the value itself, separated by a comma.");
                    return;
                }
                var key = msg.content.substring(8,msg.content.indexOf(","));
                var value = msg.content.substring(msg.content.indexOf(",")+1);
                if(["id", "status", "avatar"].indexOf(key.toLowerCase())>-1) {
                    console.log(prettyDate(new Date()) + "[WARN] User " + msg.author.username + " tried to assign default profile value");
                    bot.sendMessage(msg.channel, "You can't change the value for " + key);
                    return;
                }
                var info = "";
                if(value==".") {
                    if(!profileData[msg.author.id]) {
                        console.log(prettyDate(new Date()) + "[WARN] " + msg.author.username + " tried to delete a nonexistent profile value");
                        bot.sendMessage(msg.channel, "I didn't have anything for " + key + " in the first place.");
                        return;
                    }
                    info = "Deleted.";
                    delete profileData[msg.author.id][key];
                } else {
                    if(!profileData[msg.author.id]) {
                        profileData[msg.author.id] = {};
                    }
                    info = "Alright, got it! PM me `" + key + ",.` to delete that.";
                    profileData[msg.author.id][key] = value;
                }
                saveData("./profiles.json", function(err) {
                    if(err) {
                        console.log(prettyDate(new Date()) + "[ERROR] Failed to save profile data for " + msg.author.username);
                        bot.sendMessage(msg.channel, "Uh-oh, something went wrong. It wasn't you though.");
                    } else {
                        console.log(prettyDate(new Date()) + "[INFO] Saved " + key + " for " + msg.author.username);
                        bot.sendMessage(msg.channel, info);
                    }
                });
                return;
            }
            
            // Join new servers via PM
            if((msg.content.indexOf("https://discord.gg")>-1 || msg.content.indexOf("https://discordapp.com/invite/")>-1)) {
                try {
                    bot.startTyping(msg.channel);
                    bot.joinServer(msg.content, function(error, server) {
                        if(error) {
                            console.log(prettyDate(new Date()) + "[WARN] Failed to join new server, most likely user error");
                            bot.sendMessage(msg.channel, "Failed to join server. Please check your invite URL.");
                            return;
                        } else {
                            console.log(prettyDate(new Date()) + "[INFO] Joined server " + server.name);
                            defaultConfig(server);
                            messages[server.id] = 0;
                            cleverOn[server.id] = 0;
                            botOn[server.id] = {};
                            for(var i=0; i<server.channels; i++) {
                                botOn[server.id][server.channels[i].id] = true;
                            }
                            bot.sendMessage(msg.channel, "Successfully joined " + server.name);
                            adminMsg(false, server, msg.author, " has added me to " + server.name + ". You're one of my admins. You can manage me in this server by PMing me `config " + server.name + "`. Check out https://git.io/v2e1w to learn more.");
                            return;
                        }
                        bot.stopTyping(msg.channel);
                    });
                } catch(err) {
                    console.log(prettyDate(new Date()) + "[ERROR] Failed to join new server");
                    bot.sendMessage(msg.channel, "Failed to join server. I might be terminally ill...");
                }
            }

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
                console.log(prettyDate(new Date()) + "[INFO] Poll ended in " + ch.name + ", " + ch.server.name);
                return;
            }
            // Starts a poll in a given channel via private message
            if(msg.author.id != bot.user.id && msg.content.toLowerCase().indexOf("poll")==0) {
                var svr = bot.servers.get("name", msg.content.substring(msg.content.indexOf(" ")+1, msg.content.lastIndexOf(" ")));
                if(!svr || !svr.members.get("id", msg.author.id)) {
                    console.log(prettyDate(new Date()) + "[WARN] Invalid server provided by " + msg.author.username + " for new poll");
                    bot.sendMessage(msg.channel, "That server doesn't exist or I'm not on it.");
                } else if(configs.servers[svr.id].blocked.value.indexOf(msg.author.id)==-1) {
                    var ch = svr.channels.get("name", msg.content.substring(msg.content.lastIndexOf(" ")+1));
                    if(!ch) {
                        console.log(prettyDate(new Date()) + "[WARN] Invalid channel provided by " + msg.author.username + " for new poll");
                        bot.sendMessage(msg.channel, "Invalid channel.");
                    } else if(botOn[svr.id][ch.id]) {
                        if(configs.servers[svr.id].poll.value) {
                            if(polls[msg.author.id]) {
                                console.log(prettyDate(new Date()) + "[WARN] " + msg.author.username + " has already started a poll");
                                bot.sendMessage(msg.channel, "You've already started a poll. Close it before starting a new one.");
                            } else if(!activePolls(ch.id)) {
                                polls[msg.author.id] = {
                                    open: false,
                                    timestamp: new Date().getTime(),
                                    channel: ch.id, title: "",
                                    options: [],
                                    responderIDs: [],
                                    responses: []
                                };
                                if(!stats[svr.id].commands.poll) {
                                    stats[svr.id].commands.poll = 0;
                                }
                                stats[svr.id].commands.poll++;
                                console.log(prettyDate(new Date()) + "[INFO] Poll started by " + msg.author.username + " in " + ch.name + ", " + ch.server.name);
                                bot.sendMessage(msg.channel, "Enter the poll title or question:");
                            } else {
                                console.log(prettyDate(new Date()) + "[WARN] Poll already active in " + ch.name + ", " + ch.server.name);
                                bot.sendMessage(msg.channel, "There's already a poll going on in that channel. Try again later.");
                            }
                        }
                    }
                }
                return;
            // Gets poll title from user and asks for poll options
            } else if(polls[msg.author.id] && polls[msg.author.id].title == "") {
                polls[msg.author.id].title = msg.content;
                bot.sendMessage(msg.channel, "Enter poll options, separated by commas, or `.` for yes/no:");
                return;
            // Gets poll options from user and starts voting
            } else if(polls[msg.author.id] && polls[msg.author.id].options.length == 0) {
                if(msg.content==".") {
                    polls[msg.author.id].options = ["No", "Yes"];
                } else {
                    var start = 0;
                    for(var i=0; i<msg.content.length; i++) {
                        if(msg.content.charAt(i)==',') {
                            polls[msg.author.id].options[polls[msg.author.id].options.length] = msg.content.substring(start, i);
                            start = i+1;
                        }
                    }
                    polls[msg.author.id].options[polls[msg.author.id].options.length] = msg.content.substring(start, msg.content.length);
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
                return;
            }
            
            // Mentions command, for list of user mentions and toggle
            if(msg.content.indexOf("mentions ")==0 && msg.content.length>9) {
                var svr = bot.servers.get("name", msg.content.substring(9));
                if(!svr) {
                    console.log(prettyDate(new Date()) + "[WARN] Invalid server provided for " + msg.author.username + "'s mentions");
                    bot.sendMessage(msg.channel, "I'm not on that server. You can reply with an invite link to add me!");
                    return;
                } else if(!svr.members.get("id", msg.author.id)) {
                    console.log(prettyDate(new Date()) + "[WARN] " + msg.author.username + " is not on " + svr.name + ", so mentions cannot be retreived");
                    bot.sendMessage(msg.channel, "*You're* not on " + svr.name + ". Obviously no one has mentioned you there!");
                    return;
                }
                
                var info = "";
                if(stats[svr.id].members[msg.author.id].mentions.stream.length>0) {
                    info = "**Mentions on " + svr.name + " in the last week**";
                    for(var i=0; i<stats[svr.id].members[msg.author.id].mentions.stream.length; i++) {
                        var time = prettyDate(new Date(stats[svr.id].members[msg.author.id].mentions.stream[i].timestamp))
                        info += "\n__" + stats[svr.id].members[msg.author.id].mentions.stream[i].author + " at " + time.substring(1, time.length-2) + ":__\n" + stats[svr.id].members[msg.author.id].mentions.stream[i].message;
                    }
                    info += "\n\n";
                    stats[svr.id].members[msg.author.id].mentions.stream = [];
                } else {
                    info = "You haven't been mentioned on " + svr.name + " in the last week. I don't know if that's a good or bad thing...\n";
                }
                info += "*Remember, you can " + (stats[svr.id].members[msg.author.id].mentions.pm ? "disable" : "enable") + " PMs for mentions with `pmmentions " + svr.name + "`*";
                bot.sendMessage(msg.channel, info);
                return;
            } else if(msg.content.indexOf("pmmentions ")==0 && msg.content.length>11) {
                var svr = bot.servers.get("name", msg.content.substring(11));
                if(!svr) {
                    console.log(prettyDate(new Date()) + "[WARN] Invalid server provided for " + msg.author.username + "'s PM mentions");
                    bot.sendMessage(msg.channel, "I'm not on that server. You can reply with an invite link to add me!");
                    return;
                } else if(!svr.members.get("id", msg.author.id)) {
                    console.log(prettyDate(new Date()) + "[WARN] " + msg.author.username + " is not on " + svr.name + ", so mentions cannot be retreived");
                    bot.sendMessage(msg.channel, "*You're* not on " + svr.name + ". Obviously no one can mention you there!");
                    return;
                }
                
                stats[svr.id].members[msg.author.id].mentions.pm = !stats[svr.id].members[msg.author.id].mentions.pm;
                if(stats[svr.id].members[msg.author.id].mentions.pm) {
                    bot.sendMessage(msg.channel, "You will now receive PM notifications from me when someone mentions you in " + svr.name + ". Turn them off by replying with `pmmentions " + svr.name + "`");
                } else {
                    bot.sendMessage(msg.channel, "Turned off PMs for mentions in " + svr.name + ". Enable them again by replying with `pmmentions " + svr.name + "`");
                }
                console.log(prettyDate(new Date()) + "[INFO] Turned " + stats[svr.id].members[msg.author.id].mentions.pm ? "on" : "off" + " mention PMs for "+ msg.author.username + " in " + svr.name);
                return;
            }
        }

        // Stuff that only applies to public messages
        var extensionApplied = false;
        if(!msg.channel.isPrivate && msg.author.id!=bot.user.id) {
            // Count new message
            messages[msg.channel.server.id]++;
            stats[msg.channel.server.id].members[msg.author.id].messages++;
            
            // Check if message includes a tag or attempted tag
            var tagstring = msg.content.slice(0);
            while(tagstring.length>0 && tagstring.indexOf("@")>-1 && tagstring.substring(tagstring.indexOf("@")+1)) {
                var usr;
                if(tagstring.indexOf(bot.user.mention())==-1 && tagstring.indexOf(">")>(tagstring.indexOf("<@")+15)) {
                    var usrid = tagstring.substring(tagstring.indexOf("<@")+2);
                    usrid = usrid.substring(0, usrid.indexOf(">"));
                    tagstring = tagstring.indexOf("<@") + usrid.indexOf(">") + 3;
                    usr = msg.channel.server.members.get("id", usrid);
                } else {
                    var usrnm = tagstring.substring(tagstring.indexOf("@")+1);
                    usr = msg.channel.server.members.get("username", usrnm);
                    while(!usr && usrnm.length>0) {
                        usrnm = usrnm.substring(0, usrnm.lastIndexOf(" "));
                        usr = msg.channel.server.members.get("username", usrnm);
                    }
                    tagstring = tagstring.indexOf("@") + usrnm.length + 1;
                }
                if(usr) {
                    console.log(prettyDate(new Date()) + "[INFO] " + msg.author.username + " mentioned " + usr.username + " in " + msg.channel.server.name);
                    var mentions = stats[msg.channel.server.id].members[usr.id].mentions;
                    mentions.stream[mentions.stream.length] = {
                        timestamp: new Date().getTime(),
                        author: msg.author.username,
                        message: msg.content
                    };
                    if(mentions.pm) {
                        bot.sendMessage(usr, "__You were mentioned in a message on **" + msg.channel.server.name + "**:__\n" + msg.content);
                    }
                }
            }
            
            // If start statement is issued, say hello and begin listening
            if(msg.content.indexOf(bot.user.mention()) == 0 && msg.content.indexOf("start") > -1 && configs.servers[msg.channel.server.id].admins.value.indexOf(msg.author.id)>-1 && !botOn[msg.channel.server.id][msg.channel.id]) {
                console.log(prettyDate(new Date()) + "[INFO] Bot has been started by an admin in " + msg.channel.server.name);
                botOn[msg.channel.server.id][msg.channel.id] = true;
                bot.sendMessage(msg.channel, "Hello!");
                return;
            }
            
            // Stop responding if the author is a blocked user or bot isn't on
            if(configs.servers[msg.channel.server.id].blocked.value.indexOf(msg.author.id)>-1 || !botOn[msg.channel.server.id][msg.channel.id]) {
                return;
            }
            
            // Check for spam
            if(msg.author.id!=bot.user.id && configs.servers[msg.channel.server.id].spamfilter.value && configs.servers[msg.channel.server.id].servermod.value && msg.content.indexOf("<@120569499517714432> trivia")!=0) {
                if(configs.servers[msg.channel.server.id].admins.value.indexOf(msg.author.id)==-1) {
                    // Tracks spam for a user with each new message, expires after 45 seconds
                    if(!spams[msg.channel.server.id][msg.author.id]) {
                        spams[msg.channel.server.id][msg.author.id] = [];
                        spams[msg.channel.server.id][msg.author.id][spams[msg.channel.server.id][msg.author.id].length] = msg.content;
                        setTimeout(function() {
                            delete spams[msg.channel.server.id][msg.author.id];
                        }, 45000);
                    // Add a message to the user's spam list if it is similar to the last one
                    } else if(levenshtein.get(spams[msg.channel.server.id][msg.author.id][spams[msg.channel.server.id][msg.author.id].length-1], msg.content)<3) {
                        console.log(prettyDate(new Date()) + "[INFO] Adding message from " + msg.author.username + " in " + msg.channel.server.name + " to their spam list");
                        spams[msg.channel.server.id][msg.author.id][spams[msg.channel.server.id][msg.author.id].length] = msg.content;
                        
                        // First-time spam warning 
                        if(spams[msg.channel.server.id][msg.author.id].length == 5) {
                            console.log(prettyDate(new Date()) + "[INFO] Handling spam from " + msg.author.username);
                            bot.sendMessage(msg.author, "Stop spamming. The chat mods have been notified about this.");
                            adminMsg(false, msg.channel.server, msg.author, " is spamming " + msg.channel.server.name);
                        // Second-time spam warning, bans user from using bot
                        } else if(spams[msg.channel.server.id][msg.author.id].length == 10) {
                            console.log(prettyDate(new Date()) + "[INFO] Blocking " + msg.author.username + " after second-time spam");
                            kickUser(msg, "continues to spam " + msg.channel.server.name, "spamming");
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
                            console.log(prettyDate(new Date()) + "[WARN] User used incorrect voting syntax in " + msg.channel.name + ", " + msg.channel.server.name);
                            bot.sendMessage(msg.channel, msg.author + " Use the syntax `@" + bot.user.username + " vote <no. of choice>`");
                            return;
                        }
                        if(polls[act].responderIDs.indexOf(msg.author.id)==-1 && vt<polls[act].options.length && vt>=0) {
                            polls[act].responses[polls[act].responses.length] = vt;
                            polls[act].responderIDs[polls[act].responderIDs.length] = msg.author.id;
                            console.log(prettyDate(new Date()) + "[INFO] Vote cast for " + vt + " by " + msg.author.username + " in " + msg.channel.name + ", " + msg.channel.server.name);
                        } else {
                            console.log(prettyDate(new Date()) + "[WARN] Could not cast " + msg.author.username + "'s vote in " + msg.channel.name + ", " + msg.channel.server.name);
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
                        console.log(prettyDate(new Date()) + "[INFO] Treating \"" + msg.content + "\" from " + msg.author.username + " in " + msg.channel.server.name + " as an extension " + configs.servers[msg.channel.server.id].extensions[ext].type);
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
                                    console.log(prettyDate(new Date()) + "[WARN] Extension " + configs.servers[msg.channel.server.id].extensions[ext].type + " in " + msg.channel.server.name + " produced no output");
                                } else {
                                    bot.sendMessage(msg.channel, params.send);
                                }
                            };
                            wait(0);
                        } catch(runError) {
                            console.log(prettyDate(new Date()) + "[ERROR] Failed to run extension " + configs.servers[msg.channel.server.id].extensions[ext].type + " in " + msg.channel.server.name + ": " + runError);
                        }
                        bot.stopTyping(msg.channel);
                        break;
                    }
                }
            }

            // Google Play Store links bot
            if(msg.author.id!=bot.user.id && msg.content.toLowerCase().indexOf("linkme ")>-1 && configs.servers[msg.channel.server.id].linkme.value) {
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
                    if(apps.indexOf(cand)==-1 && cand!="" && cand) {
                        apps[apps.length] = cand;
                    }
                }
                apps[apps.length] = app;
                
                // Make sure query is not empty
                if(apps.length==0) {
                    console.log(prettyDate(new Date()) + "[WARN] User did not provide an app to link in " + msg.channel.server.name);
                    bot.sendMessage(msg.channel, msg.author + " You need to give me an app to link!");
                    return;
                }
                
                // Fetch app links
                console.log(prettyDate(new Date()) + "[INFO] " + msg.author.username + " requested the following app(s) in " + msg.channel.server.name + ": " + apps);
                bot.startTyping(msg.channel);
                for(var i=0; i<apps.length; i++) {
                    var basePath = "https://play.google.com/store/search?&c=apps&q=" + apps[i] + "&hl=en";
                    var data;
                    // Scrapes Play Store search results webpage for information
                    request(basePath, function(error, res, chunk) {
                        if (!error && res.statusCode == 200) {
                            data = scrapeSearch(chunk);
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
                                console.log(prettyDate(new Date()) + "[WARN] App " + apps[i] + " not found to link in " + msg.channel.server.name);
                                send = msg.author + " Sorry, no such app exists.\n";
                            }
                            bot.stopTyping(msg.channel);
                            bot.sendMessage(msg.channel, send);
                        }
                    });
                }
                
                return;
            }
        }

        // Check if message is a command (bot tagged and matches commands list)
        if(msg.author.id != bot.user.id && (msg.content.indexOf(bot.user.mention()) == 0 || msg.channel.isPrivate) && msg.content.indexOf("**")!=0) {
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
            if(cmd && !msg.channel.isPrivate && !extensionApplied && botOn[msg.channel.server.id][msg.channel.id]) {
                if(configs.servers[msg.channel.server.id][cmdTxt]) {
                    if(!configs.servers[msg.channel.server.id][cmdTxt].value) {
                        return;
                    }
                }
                bot.startTyping(msg.channel);
                if(filter.indexOf(suffix)>-1 && configs.servers[msg.channel.server.id].admins.value.indexOf(msg.author.id)==-1 && configs.servers[msg.channel.server.id].nsfwfilter.value && configs.servers[msg.channel.server.id].servermod.value && cmdTxt!="reddit") {
                    console.log(prettyDate(new Date()) + "[INFO] Handling filtered query \"" + msg.content + "\" from " + msg.author.username + " in " +  msg.channel.server.name);
                    kickUser(msg, "is abusing the bot", "attempting to fetch NSFW content");
                } else if(botOn[msg.channel.server.id][msg.channel.id]) {
                    console.log(prettyDate(new Date()) + "[INFO] Treating \"" + msg.content + "\" from " + msg.author.username + " in " + msg.channel.server.name + " as a command");
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
                    if(!configs.servers[msg.channel.server.id].chatterbot.value || !botOn[msg.channel.server.id][msg.channel.id]) {
                        return;
                    }
                    console.log(prettyDate(new Date()) + "[INFO] Treating \"" + msg.content + "\" from " + msg.author.username + " in " + msg.channel.server.name + " as chatterbot prompt"); 
                } else {
                    console.log(prettyDate(new Date()) + "[INFO] Treating \"" + msg.content + "\" from " + msg.author.username + " as chatterbot prompt"); 
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
            if(msg.author != bot.user && msg.isMentioned(bot.user) && configs.servers[msg.channel.server.id].tagreaction.value && botOn[msg.channel.server.id][msg.channel.id]) {
                console.log(prettyDate(new Date()) + "[INFO] Tagged by " + msg.author.username + " in " + msg.channel.server.name);
                bot.sendMessage(msg.channel,msg.author + ", you called?");
            }
        }
    } catch(mainError) {
        bot.stopTyping(msg.channel);
        console.log(prettyDate(new Date()) + "[ERROR] Failed to process new message in " + msg.channel.server.name);
        console.log(mainError);
    }
});

// Add server if joined outisde of bot
bot.on("serverCreated", function(svr) {
    console.log(prettyDate(new Date()) + "[INFO] New server " + svr.name);
    defaultConfig(svr);
    messages[svr.id] = 0;
    cleverOn[svr.id] = 0;
    botOn[svr.id] = {};
    for(var i=0; i<svr.channels; i++) {
        botOn[svr.id][svr.channels[i].id] = true;
    }
    adminMsg(false, svr, configs.maintainer ? configs.maintainer : {username: "I"}, configs.maintainer ? (configs.maintainer + " has added me to ") : " have added myself to " + svr.name + ". You're one of my admins. You can manage me in this server by PMing me `config " + svr.name + "`. Check out https://git.io/v2e1w to learn more.");
});

// Leave server if deleted
bot.on("serverDeleted", function(svr) {
    delete configs.servers[svr.id];
    delete messages[svr.id];
    delete cleverOn[svr.id];
    console.log(prettyDate(new Date()) + "[INFO] Server " + svr.name + " removed, left server");
});

// New server member handling
bot.on("serverNewMember", function(svr, usr) {
    // Check if this has been enabled in admin console and the bot is listening
    if(configs.servers[svr.id].servermod.value && botOn[svr.id][svr.defaultChannel.id]) {
        console.log(prettyDate(new Date()) + "[INFO] " + usr.username + " has joined " + svr.name);
        bot.sendMessage(svr.defaultChannel, greetings[getRandomInt(0, greetings.length-1)].replace("++", usr));
        var info = "Welcome to the " + svr.name + " Discord chat! " + configs.servers[svr.id].newgreeting.value + "\n\nI'm " + bot.user.username + " by the way. You can interact with me in any of the channels by tagging me with `@" + bot.user.username + "` and then stating any one of the following commands:" + getHelp(svr);
        bot.sendMessage(usr, info);
    }
    stats[svr.id].members[usr.id] = {
        messages: 0,
        seen: new Date().getTime(),
        mentions: {
            pm: false,
            stream: []
        }
    };
});

// Message on user banned
bot.on("userBanned", function(usr, svr) {
    if(configs.servers[svr.id].servermod.value && botOn[svr.id][svr.defaultChannel.id]) {
        console.log(prettyDate(new Date()) + "[INFO] User " + usr.username + " has been banned from " + svr.name);
        bot.sendMessage(svr.defaultChannel, usr.username + " has been banned.");
    }
});

// Message on user unbanned
bot.on("userUnbanned", function(usr, svr) {
    if(configs.servers[svr.id].servermod.value && botOn[svr.id][svr.defaultChannel.id]) {
        console.log(prettyDate(new Date()) + "[INFO] User " + usr.username + " has been unbanned from " + svr.name);
        bot.sendMessage(svr.defaultChannel, usr.username + " is no longer banned.");
    }
});

// Update lastSeen status on presence change
bot.on("presence", function(oldusr, newusr) {
    for(var i=0; i<bot.servers.length; i++) {
        if(bot.servers[i].members.get("id", newusr.id)) {
            if(oldusr.status=="online" && newusr.status!="online") {
                stats[bot.servers[i].id].members[newusr.id].seen = new Date().getTime();
            }
            if(oldusr.username!=newusr.username && configs[bot.servers[i].id].servermod.value) {
                bot.sendMessage(bot.servers[i].defaultChannel, "**@" + oldusr.username + "** is now **@" + newusr.username + "**");
            }
        }
    }
});

// Attempt authentication if disconnected
bot.on("disconnected", function() {
    if(readyToGo) {
        disconnects++;
        console.log(prettyDate(new Date()) + "[ERROR] Disconnected from Discord, will try again in 5s");
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
        trivia[chid].answer = line.substring(line.indexOf(":")+2).replace('#', '');
    });
    console.log(prettyDate(new Date()) + "[INFO] New trivia question in " + bot.channels.get("id", chid).name);
    return info;
}

// Get a line in a non-JSON file
function getLine(filename, line_no, callback) {
    var data = fs.readFileSync(filename, 'utf8');
    var lines = data.split("\n");

    if(+line_no > lines.length){
      throw new Error('File end reached without finding line');
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
        console.log(prettyDate(new Date()) + "[INFO] Cleared stats for this week");
        for(var svrid in stats) {
            if(svrid=="timestamp") {
                continue;
            }
            clearServerStats(svrid);
        }
    } else {
        for(var i=0; i<bot.servers.length; i++) {
            for(var j=0; j<bot.servers[i].members.length; j++) {
                // If member is playing game, add 0.1 (equal to five minutes) to game tally
                if(bot.servers[i].members[j].game) {
                    if(!stats[bot.servers[i].id].games[bot.servers[i].members[j].game.name]) {
                        stats[bot.servers[i].id].games[bot.servers[i].members[j].game.name] = 0;
                    }
                    stats[bot.servers[i].id].games[bot.servers[i].members[j].game.name] += 0.1;
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
    saveData("./stats.json", function(err) {
        if(err) {
            console.log(prettyDate(new Date()) + "[ERROR] Could not save updated stats");
        }
    });
    setTimeout(function() {
        clearStatCounter();
    }, 300000);
}

// Clear stats.json for a server
function clearServerStats(svrid) {
    for(var member in stats[svrid].members) {
        stats[svrid].members[member].messages = 0;
    }
    for(var game in stats[svrid].games) {
        stats[svrid].games[game] = 0;
    }
    for(var cmd in stats[svrid].commands) {
        stats[svrid].commands[cmd] = 0;
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
                    console.log(prettyDate(new Date()) + "[WARN] Timer extension " + extension.type + " in " + svr.name + " produced no output");
                } else {
                    for(var i=0; i<extension.channels; i++) {
                        var ch = svr.channels.get("name", extension.channels[i]);
                        if(ch) {
                            bot.sendMessage(ch, params.send);
                        }
                    }
                }
            };
            wait(0);
        } catch(runError) {
            console.log(prettyDate(new Date()) + "[ERROR] Failed to run timer extension " + extension.type + " in " + svr.name + ": " + runError);
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
        str += numyears + " years ";
    }
    if(numdays>0) {
        str += numdays + " days ";
    }
    if(numhours>0) {
        str += numhours + " hours ";
    }
    if(numminutes>0) {
        str += numminutes + " minutes ";
    }
    if(numseconds>0) {
        str += numseconds + " seconds ";
    }
    return str;
}

// Default config file
var defaultConfigFile = {
    admins: {
        value: [],
        option: "<username or ID to add/remove>"
    },
    blocked: {
        value: [],
        option: "<username or ID to add/remove>"
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
    char: {
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
        for(var i=0; i<svr.members.length; i++) {
            if(svr.rolesOfUser(svr.members[i])) {
                for(var j=0; j<svr.rolesOfUser(svr.members[i]).length; j++) {
                    if(svr.rolesOfUser(svr.members[i])[j].hasPermission("banMembers") && adminList.indexOf(svr.members[i].id)==-1 && svr.members[i].id!=bot.user.id) {
                        adminList[adminList.length] = svr.members[i].id;
                    }
                }
            }
            stats[svr.id].members[svr.members[i].id] = {
                messages: 0,
                seen: new Date().getTime(),
                mentions: {
                    pm: false,
                    stream: []
                }
            };
        }
        saveData("./stats.json", function(err) {
            if(err) {
                console.log(prettyDate(new Date()) + "[ERROR] Could not save updated stats");
            }
        });
        configs.servers[svr.id] = JSON.parse(JSON.stringify(defaultConfigFile)); 
        configs.servers[svr.id].admins.value = adminList;
        saveData("./config.json", function(err) {
            if(err) {
                console.log(prettyDate(new Date()) + "[ERROR] Failed to save default configs for server " + svr.name);
            } else {
                console.log(prettyDate(new Date()) + "[INFO] Successfully saved default configs for " + svr.name);
            }
        });
    }
}

// Ensure that config.json is setup properly
function checkConfig(svr) {
    var changed = false;
     
    for(var i=0; i<Object.keys(defaultConfigFile).length; i++) {
        if(!configs.servers[svr.id][Object.keys(defaultConfigFile)[i]]) {
            changed = true;
            configs.servers[svr.id][Object.keys(defaultConfigFile)[i]] = defaultConfigFile[Object.keys(defaultConfigFile)[i]];
        }
    }
    
    if(changed) {
        saveData("./config.json", function(err) {
            if(err) {
                console.log(prettyDate(new Date()) + "[ERROR] Failed to update configs for server " + svr.name);
            } else {
                console.log(prettyDate(new Date()) + "[INFO] Successfully saved updated configs for " + svr.name);
            }
        });
    }
}

// Write an updated config.json file to disk
function saveData(file, callback) {
    var object;
    switch(file) {
        case "./profiles.json": 
            object = profileData;
            break;
        case "./stats.json":
            object = stats;
            break;
        case "./config.json":
            object = configs;
            break;
        case "./auth.json":
            object = AuthDetails;
            break;
    }
    fs.writeFile(file, JSON.stringify(object, null, 4), function(err) {
        callback(err);
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
    info += "\n*Poll open for " + secondsToString((new Date().getTime() - polls[usrid].timestamp)/1000) + "*";
    
    return info;
}

// Attempt to kick a member
function kickUser(msg, desc1, desc2) {
    bot.kickMember(msg.author, msg.channel.server, function(err) {
        if(err) {
            configs.servers[msg.channel.server.id].blocked[configs.servers[msg.channel.server.id].blocked.value.length] = msg.author.id;
            saveData("./config.json", function(error) {
                adminMsg(error, msg.channel.server, msg.author, " " + desc1 + " in " + msg.channel.server.name + ", so I blocked them from using me.");
                bot.sendMessage(msg.author, "Stop " + desc2 + ". The chat mods have been notified about this, and you have been blocked from using me.");
            });
        } else {
            adminMsg(err, msg.channel.server, msg.author, " " + desc1 + " in " + msg.channel.server.name + ", so I kicked them from the server.");
        }
    });
}

// Searches Google Images for keyword(s)
function giSearch(query, num, callback) {
	var url = "https://www.googleapis.com/customsearch/v1?key=" + AuthDetails.google_api_key + "&cx=" + AuthDetails.custom_search_id + "&safe=high&q=" + (query.replace(/\s/g, '+').replace(/&/g, '')) + "&alt=json&searchType=image" + num;
	request(url, function(err, res, body) {
		var data;
		try {
			data = JSON.parse(body);
		} catch (error) {
			console.log(prettyDate(new Date()) + "[ERROR] Could not connect to Google Images");
			return;
		}
		if(!data.items || data.items.length == 0 || query.indexOf("<#")>-1) {
            console.log(prettyDate(new Date()) + "[WARN] No image results for " + query);
            callback(null);
		} else {
            callback(data.items[0].link);
		}
	});	
}

// Google Play Store search page scraper
function scrapeSearch(data) {
    x = cheerio.load(data);
    var card_list = x('.card-list');
    var items = [];
    card_list.find('.card').each(function() {
        var card = {};
        var card_data = x(this);
        card['cover-image'] = card_data.find('img.cover-image').attr('src');
        card['click-target'] = card_data.find('.card-click-target').attr('src');
        card['name'] = card_data.find('.details .title').attr('title');
        card['url'] = 'https://play.google.com' + card_data.find('.details .title').attr('href');
        card['company'] = card_data.find('.details .subtitle').attr('title');
        card['html_description'] = card_data.find('.details .description').text();
        card['rating_description'] = card_data.find('.tiny-star').attr('aria-label');
        var rating_style = card_data.find('.tiny-star .current-rating').attr('style');
        if(rating_style) {
            card['rating'] = parseFloat(rating_style.match(/\d+/g)[0]*5 / 100.0);
        } else {
            card['rating'] = "unknown";
        }
        card['price'] = card_data.find('.price-container .display-price').text();

        items.push(card);
    });

    var result = {
        total: items.length,
        items: items
    };

    return result;
}

// Searches Giphy for matching GIFs
function getGIF(tags, func, rating) {
    var params = {
        "api_key": AuthDetails.giphy_api_key,
        "rating": rating,
        "format": "json",
        "limit": 1
    };
    var query = qs.stringify(params);

    if(tags !== null) {
        query += "&tag=" + tags.join('+')
    }
    
    request("http://api.giphy.com/v1/gifs/random?" + query, function(error, response, body) {
        if(error || response.statusCode !== 200) {
            console.log(prettyDate(new Date()) + "[ERROR] Could not connect to Giphy");
        } else {
            try {
                var responseObj = JSON.parse(body)
                func(responseObj.data.id);
            } catch(err) {
                console.log(prettyDate(new Date()) + "[ERROR] Failed to retreive GIF " + tags);
                func(undefined);
            }
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
            console.log(prettyDate(new Date()) + "[ERROR] Could not connect to YouTube");
            q =  "`¯\_(ツ)_/¯`";
        } else {
            if (!result || !result.items || result.items.length < 1) {
                console.log(prettyDate(new Date()) + "[WARN] No YouTube results for " + query);
                q = "`¯\_(ツ)_/¯`";
            } else if(result.items[0].id.videoId=="http://www.youtube.com/watch?v=undefined") {
                console.log(prettyDate(new Date()) + "[WARN] No YouTube results for " + query);
                q = "`¯\_(ツ)_/¯`";
            } else {
                q = "http://www.youtube.com/watch?v=" + result.items[0].id.videoId;
            }
        }
        callback(q);
    });
}

// Delete last n bot messages
function cleanMessages(open, ch, count, option) {
    getMessages(ch, option, function(error, messages) {
        if(!error) {
            for(var i=0; i<messages.length; i++) {
                if(messages[i].author.id==bot.user.id) {
                    count--;
                    bot.deleteMessage(messages[i]);
                    if(count==0) {
                        console.log(prettyDate(new Date()) + "[INFO] Deleted messages in " + ch.name + ", " + ch.server.name);
                        bot.sendMessage(open, "Deleted those messages in " + ch.name);
                        break;
                    }
                }
            }
            if(count>0) {
                cleanMessages(open, ch, count, {before: messages[messages.length-1]});
            }
        } else {
            console.log(error);
            console.log(prettyDate(new Date()) + "[ERROR] Failed to fetch old messages in " + ch.name + ", " + ch.server.name);
            bot.sendMessage(open, "Something went wrong getting past messages from Discord :cry:");
        }
    });
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
        console.log(prettyDate(new Date()) + "[ERROR] Failed to message bot admins of " + svr.name);
    }
}

// Ouput a pretty date for logging
function prettyDate(date) {
    return "[" + date.getUTCFullYear() + "-" + ("0" + (date.getUTCMonth() + 1)).slice(-2) + "-" + ("0" + date.getUTCDate()).slice(-2) + " " + ("0" + date.getUTCHours()).slice(-2) + ":" + ("0" + date.getUTCMinutes()).slice(-2) + ":" + ("0" + date.getUTCSeconds()).slice(-2) + " UTC] ";
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

    info += "\n\nFor example, you could do `@" + bot.user.username + " remindme 5 s Hello`. You can get app links from the Google Play store by using `linkme <some app>`.\n\nThe following commands are also available via PM:\n\tpoll <server> <channel>\n\tmentions <server>\n\tprofile <key>,<value>\n\tconfig <server>\n\nOn top of all this, you can talk to me about anything privately or in the main chat (by tagging me). Have fun! ;)\n\nVersion " + version + " by @anandroiduser, https://git.io/v2e1w";
    return info;
}

// Check for updates
function checkVersion() {
    unirest.get('http://awesome-botmakersinc.rhcloud.com/')
    .header('Accept', 'application/json')
    .end(function(response) {
        try {
            if(!response.body || !response.body[0]) {
                console.log(prettyDate(new Date()) + "[ERROR] Failed to check for updates");
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
                console.log(prettyDate(new Date()) + "[INFO] Found " + info + " new bot updates");
                var send = "There are " + info + " new updates available for " + bot.user.username;
                for(var i=0; i<outOfDate; i++) {
                    send += "\n\t" + (response.body[i][0] + "             ").slice(0,15);
                    if(response.body[i][1]) {
                        send += response.body[i][1];
                    }
                }
                send += "\nLearn more at https://git.io/vg5mc";
                
                console.log(send);
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
                console.log(prettyDate(new Date()) + "[WARN] Could not message bot maintainer about new updates");
            } else {
                console.log(prettyDate(new Date()) + "[INFO] " + bot.user.username + " is up-to-date");
            }
        } catch(error) {
            console.log(prettyDate(new Date()) + "[ERROR] Failed to check for updates");
            console.log(error);
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
                        console.log(prettyDate(new Date()) + "[FATAL] Error saving authentication details");
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
                            saveData("./config.json", function(err) {
                                if(err) {
                                    console.log(prettyDate(new Date()) + "[ERROR] Error saving configuration");
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
                            saveData("./config.json", function(err) {
                                if(err) {
                                    console.log(prettyDate(new Date()) + "[ERROR] Error saving configuration");
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
                            saveData("./config.json", function(err) {
                                if(err) {
                                    console.log(prettyDate(new Date()) + "[ERROR] Error saving configuration");
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
                // Login to the bot's Discord account
                bot.login(AuthDetails.email, AuthDetails.password, function(loginError) {
                    if(loginError) {
                        console.log(prettyDate(new Date()) + "[FATAL] Could not connect to Discord");
                        process.exit(1);
                    }
                    readyToGo = true;
                    configs.setup = true;
                    saveData("./config.json", function(err) {
                        if(err) {
                            console.log(prettyDate(new Date()) + "[ERROR] Error saving configuration");
                        }
                    });
                });
                break;
        }
    }
}
setup(0);