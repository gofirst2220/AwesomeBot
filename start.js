// Get all the basic modules and files setup
const Discord = require("discord.js");
var botOn = {};
var version = "3.2.3";
var outOfDate = 0;
var configs = require("./config.json");
const AuthDetails = require("./auth.json");
var disconnects = 0;
var profileData = require("./data.json");
var filter = require("./filter.json");

// Hijack console to display in web interface
var log = [];
(function() {
    var old = console.log;
    console.log = function(msg) {
        old.apply(this, arguments);
        log[log.length] = msg;
    }
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
const util = require('util');
const vm = require('vm');

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
    // Gets YouTube link with given keywords
    "youtube": {
        usage: " <video tags>",
        process: function(bot, msg, suffix) {
            if(!suffix) {
                console.log(prettyDate() + "[WARN] User did not provide search term(s)");
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
    // Allows approved users (essentially bot admins) to change chatterbot engine
    "chatterbot": {
        usage: " <display or switch>",
        process: function(bot, msg, suffix) {
            if(configs.servers[msg.channel.server.id].admins.indexOf(msg.author.id)>-1) {
                var isSwitch = suffix.toLowerCase() === "switch";
                if (isSwitch) cleverOn[msg.channel.server.id] = !cleverOn[msg.channel.server.id];
                var using = !cleverOn[msg.channel.server.id] ? "Mitsuku" : "Cleverbot";
                
                if(isSwitch) {
                    console.log(prettyDate() + "[INFO] Switched to " + using + " in " + msg.channel.server.name);
                    bot.sendMessage(msg.channel,"Now using " + using + " for conversations.");
                } else {
                    bot.sendMessage(msg.channel,"Currently using " + using + " for conversations.");
                }
            } else {
                console.log(prettyDate() + "[WARN] User is not a bot admin");
                bot.sendMessage(msg.channel,msg.author + " Only my friends can do that.");
            }

        }
    },
    // Searches Google Images with keyword(s)
    "image": {
        usage: " <image tags>",
        process: function(bot,msg,suffix) {
            if(!suffix) {
                console.log(prettyDate() + "[WARN] User did not provide search term(s)");
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
		usage: " <GIF tags>",
		process: function(bot, msg, suffix) {
            if(!suffix) {
                console.log(prettyDate() + "[WARN] User did not provide search term(s)");
                bot.sendMessage(msg.channel, msg.author + " I don't know of a GIF for nothing.");
                return;
            }
		    var tags = suffix.split(" ");
            var rating = "pg-13";
            if(!configs.servers[msg.channel.server.id].nsfwfilter) {
                rating = "r";
            }
		    getGIF(tags, function(id) {
                if(typeof id !== "undefined") {
                    bot.sendMessage(msg.channel, "http://media.giphy.com/media/" + id + "/giphy.gif");
                } else {
                    console.log(prettyDate() + "[WARN] GIF not found for " + suffix);
                    bot.sendMessage(msg.channel, "The Internet has run out of memes :/");
                }
		    }, rating);
		}
	},
    // Defines word from Urban Dictionary
    "urban": {
        usage: " <term>",
        process: function(bot, msg, suffix) {
            var def = urban(suffix);
            def.first(function(data) {
                bot.sendMessage(msg.channel, "**" + suffix + "**: " + data.definition.replace("\r\n\r\n", "\n") + "\n*" + data.example.replace("\r\n\r\n", "\n") + "*\n`" + data.thumbs_up + " up, " + data.thumbs_down + " down`");
            });
        }
    },
    // Gets Wikipedia article with given title
    "wiki": {
        usage: " <search terms>",
        process: function(bot, msg, suffix) {
            var query = suffix;
            if(!query) {
                console.log(prettyDate() + "[WARN] User did not provide search term(s)");
                bot.sendMessage(msg.channel, msg.author + " You need to provide a search term.");
                return;
            }
            new Wiki().search(query,1).then(function(data) {
                if(data.results.length==0) {
                    console.log(prettyDate() + "[WARN] Wikipedia article not found for " + query);
                    bot.sendMessage(msg.channel, "I don't think Wikipedia has an article on that.");
                    return;
                }
                new Wiki().page(data.results[0]).then(function(page) {
                    page.summary().then(function(summary) {
                        if(summary.indexOf(" may refer to:")==query.length) {
                            console.log(prettyDate() + "[WARN] Ambiguous search term provided");
                            bot.sendMessage(msg.channel, "There are several matching Wikipedia articles; try making your query more specific.");
                        } else {
                            var sumText = summary.toString().split('\n');
                            var continuation = function() {
                                var paragraph = sumText.shift();
                                if(paragraph) {
                                    bot.sendMessage(msg.channel, paragraph, continuation);
                                }
                            };
                            continuation();
                        }
                    });
                });
            }, function(err) {
                console.log(prettyDate() + "[ERROR] Unable to connect to Wikipedia");
                bot.sendMessage(msg.channel, "Uhhh...Something went wrong :(");
            });
        }
    },
    // Converts between units
    "convert": {
        usage: " <#> <unit> to <unit>",
        process: function(bot, msg, suffix) {
            var toi = suffix.lastIndexOf(" to ");
            if(toi==-1) {
                console.log(prettyDate() + "[WARN] User used incorrect syntax");
                bot.sendMessage(msg.channel, msg.author + " Sorry, I didn't get that. Make sure you're using the right syntax: `@" + bot.user.username + " <no.> <unit> to <unit>`");
            } else {
                try {
                    var num = suffix.substring(0, suffix.indexOf(" "));
                    var unit = suffix.substring(suffix.indexOf(" ")+1, suffix.lastIndexOf(" to ")).toLowerCase();
                    var end = suffix.substring(suffix.lastIndexOf(" ")+1).toLowerCase();
                    
                    if(isNaN(num)) {
                        console.log(prettyDate() + "[WARN] User did not provide a numeric quantity");
                        bot.sendMessage(msg.channel, msg.author + " That's not a number...");
                        return;
                    }
                    if(convert().possibilities().indexOf(unit)!=-1) {
                        if(convert().from(unit).possibilities().indexOf(end)!=-1) {
                            bot.sendMessage(msg.channel, (Math.round(convert(num).from(unit).to(end) * 1000) / 1000) + " " + end);
                            return;
                        }
                    }
                    console.log(prettyDate() + "[WARN] Unsupported unit(s)");
                    bot.sendMessage(msg.channel, msg.author + " I don't support that unit, try something else.");
                } catch(err) {
                    console.log(prettyDate() + "[WARN] User used incorrect syntax");
                    bot.sendMessage(msg.channel, msg.author + " Are you sure you're using the correct syntax?");
                }
            }
        }
    },
    // Fetches stock symbol from Yahoo Finance
    "stock": {
        usage: " <stock symbol>",
        process: function(bot, msg, suffix) {
            if(!suffix) {
                console.log(prettyDate() + "[WARN] User did not provide stock symbol");
                bot.sendMessage(msg.channel, msg.author + " You never gave me a stock symbol! I'm not a magician, you know.");
                return;
            }
            unirest.get("http://finance.yahoo.com/webservice/v1/symbols/" + suffix + "/quote?format=json&view=detail")
            .header("Accept", "application/json")
            .end(function(result) {
                if(result.status==200 && JSON.parse(result.raw_body).list.resources[0]) {
                    var stats = JSON.parse(result.raw_body).list.resources[0].resource.fields;
                    var info = stats.issuer_name + " (" + stats.symbol + ")\n\t$" + (Math.round((stats.price)*100)/100) + "\n\t";
                    info += " " + (Math.round((stats.change)*100)/100) + " (" + (Math.round((stats.chg_percent)*100)/100) + "%)\n\t$" + (Math.round((stats.day_low)*100)/100) + "-$" + (Math.round((stats.day_high)*100)/100);
                    bot.sendMessage(msg.channel, info);
                } else {
                    console.log(prettyDate() + "[WARN] Stock symbol " + suffix + " not found")
                    bot.sendMessage(msg.channel, "Sorry, I can't find that stock symbol.");
                }
            });
        }
    },
    // Displays the weather for an area
    "weather": {
        usage: " <location> <(optional) F or C>",
        process: function(bot, msg, suffix) {
            var unit = "F";
            var location = suffix;
            if([" F", " C"].indexOf(suffix.substring(suffix.length-2))>-1) {
                unit = suffix.charAt(suffix.length-1).toString();
                location = suffix.substring(0, suffix.length-2);
            }
            weather.find({search: location, degreeType: unit}, function(err, data) {
                if(err) {
                    console.log(prettyDate() + "[WARN] Could not find location " + location + " in " + msg.channel.server.name);
                    bot.sendMessage(msg.channel, msg.author + " I can't find weather info for " + location);
                } else {
                    data = data[0];
                    bot.sendMessage(msg.channel, "**" + data.location.name + " right now:**\n" + data.current.temperature + "°" + unit + " " + data.current.skytext + ", feels like " + data.current.feelslike + "°\n**Forecast for tomorrow:**\nHigh: " + data.forecast[1].high + "°, low: " + data.forecast[1].low + "° " + data.forecast[1].skytextday + " with " + data.forecast[1].precip + "% chance precip.");
                }
            });
        }
    },
    // Silences the bot until the start statement is issued
    "quiet": {
        process: function(bot, msg) {
            if(configs.servers[msg.channel.server.id].admins.indexOf(msg.author.id)>-1) {
                bot.sendMessage(msg.channel,"Ok, I'll shut up.");
                console.log(prettyDate() + "[INFO] Bot has been quieted by an admin in " + msg.channel.server.name);
                botOn[msg.channel.server.id] = false;
            } else {
                console.log(prettyDate() + "[WARN] User is not a bot admin");
                bot.sendMessage(msg.channel,msg.author + " Sorry, I won't listen to you :P");
            }

        }
    },
    // Starts, ends, and answers live trivia game
    "trivia": {
        usage: " <start, end, next, or answer choice>",
        process: function(bot, msg, suffix) {
            var triviaOn = trivia[msg.channel.id]!=null;
            switch(suffix) {
                case "start":
                    if(!triviaOn) {
                        console.log(prettyDate() + "[INFO] Trivia game started in " + msg.channel.name + ", " + msg.channel.server.name);
                        trivia[msg.channel.id] = {answer: "", attempts: 0, score: 0, possible: 0};
                        bot.sendMessage(msg.channel, "Welcome to **AwesomeTrivia**! Here's your first question: " + triviaQ(msg.channel.id) + "\nAnswer by tagging me like this: `@" + bot.user.username + " trivia <no. of choice>` or skip by doing this: `@" + bot.user.username + " trivia next`\nGood Luck!");
                        trivia[msg.channel.id].possible++;
                    } else {
                        console.log(prettyDate() + "[WARN] Ongoing trivia game in channel " + msg.channel.name + ", " + msg.channel.server.name);
                        bot.sendMessage(msg.channel, "There's a trivia game already in progress on this server, in " + msg.channel.name);
                    }
                    break;
                case "end":
                    if(triviaOn) {
                        var outof = trivia[msg.channel.id].possible-1;
                        if(trivia[msg.channel.id].possible==1) {
                            outof = 1;
                        }
                        console.log(prettyDate() + "[INFO] Trivia game ended in " + msg.channel.name + ", " + msg.channel.server.name);
                        bot.sendMessage(msg.channel, "Thanks for playing! Y'all got " + trivia[msg.channel.id].score + " out of " + outof);
                        delete trivia[msg.channel.id];
                    } else {
                        console.log(prettyDate() + "[WARN] No ongoing trivia game to end in " + msg.channel.name + ", " + msg.channel.server.name);
                        bot.sendMessage(msg.channel, "There isn't a trivia game going on right now. Start one by typing `@" + bot.user.username + " trivia start`");
                    }
                    break;
                case "next":
                    if(triviaOn) {
                        console.log(prettyDate() + "[INFO] Trivia question skipped");
                        bot.sendMessage(msg.channel, "The answer was " + trivia[msg.channel.id].answer + "\n**Next Question:** " + triviaQ(msg.channel.id));
                        trivia[msg.channel.id].possible++;
                    } else {
                        console.log(prettyDate() + "[WARN] No ongoing trivia game in which to skip question in " + msg.channel.name + ", " + msg.channel.server.name);
                        bot.sendMessage(msg.channel, "There isn't a trivia game going on right now. Start one by typing `@" + bot.user.username + " trivia start`");
                    }
                    break;
                default:
                    if(triviaOn) {
                        if(levenshtein.get(suffix.toLowerCase(), trivia[msg.channel.id].answer.toLowerCase())<3 && triviaOn) {
                            console.log(prettyDate() + "[INFO] Correct trivia game answer in " + msg.channel.name + ", " + msg.channel.server.name);
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
                        console.log(prettyDate() + "[WARN] No ongoing trivia game to answer in " + msg.channel.name + ", " + msg.channel.server.name);
                        bot.sendMessage(msg.channel, "There isn't a trivia game going on right now. Start one by typing `@" + bot.user.username + " trivia start`");
                    }
            }
        }
    },
    // Sends reminders in given time for given note
    "remindme": {
        usage: " <no.> <h, m, or s> <note>",
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
            console.log(prettyDate() + "[INFO] Reminder set by " + msg.author + " in " + num + time);
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
                console.log(prettyDate() + "[INFO] Reminded user " + msg.author);
            }, countdown);
        }
    },
    // Gets top (max 4) posts in given subreddit, sorting hot, includes pinned
    "reddit": {
        usage: " <subreddit> <count>",
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
            }
            if(!sub || !count) {
                console.log(prettyDate() + "[WARN] User did not provide subreddit and count");
                bot.sendMessage(msg.channel, msg.author + " Make sure you include a subreddit and number of posts to get.");
                return;
            } else if(count<1 || isNaN(count) || count>5) {
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
                            console.log(prettyDate() + "[WARN] Subreddit not found or Reddit unavailable");
                            bot.sendMessage(msg.channel, "Surprisingly, I couldn't find anything in " + sub + " on reddit.");
                            return;
                        } else if(data[i].data.over_18 && configs.servers[msg.channel.server.id].admins.indexOf(msg.author.id)==-1 && configs.servers[msg.channel.server.id].nsfwfilter) {
                            console.log(prettyDate() + "[INFO] Handling filtered query from " + msg.author.username);
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
                    console.log(prettyDate() + "[WARN] Subreddit not found or Reddit unavailable");
                    bot.sendMessage(msg.channel, "Surprisingly, I couldn't find anything in " + sub + " on reddit.");
                }
            });
        }
    },
    // Gets top (max 4) posts in given RSS feed name 
    "rss": {
        usage: " <site> <count>",
        process: function(bot, msg, suffix) {
            if(configs.servers[msg.channel.server.id].rss[0]) {
                var site = suffix.substring(0, suffix.indexOf(" "));
                var count = parseInt(suffix.substring(suffix.indexOf(" ")+1));

                if(site=="" || !site) {
                    console.log(prettyDate() + "[WARN] User did not provide feed name and count");
                    bot.sendMessage(msg.channel, msg.author + " Please include both a feed name and number of posts to get.");
                } else if(!isNaN(count) && configs.servers[msg.channel.server.id].rss[2].indexOf(site.toLowerCase())>-1) {
                    rssfeed(bot,msg,configs.servers[msg.channel.server.id].rss[1][configs.servers[msg.channel.server.id].rss[2].indexOf(site.toLowerCase())], count, false);
                } else {
                    console.log(prettyDate() + "[WARN] Feed " + site + " not found");
                    bot.sendMessage(msg.channel, msg.author + " Feed not found.");
                }
            }
        }
    },
    // Generates a random number
    "roll": {
        usage: " <max # inclusive>",
        process: function(bot, msg, suffix) {
            if(!suffix || suffix=="null" || isNaN(suffix) || suffix < 1) {
                console.log(prettyDate() + "[WARN] User provided nonsensical parameter");
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
                if(msg.channel.server.members[i].game) {
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
        usage: " <username>",
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
                    info += "\n**On " + msg.channel.server.name + "**";
                    var details = msg.channel.server.detailsOfUser(usr);
                    if(details.roles.length>0) {
                        info += "\n\tRoles: " + details.roles[0].name;
                        for(var i=1; i<details.roles.length; i++) {
                            info += ", " + details.roles[i].name;
                        }
                    }
                    var joined = new Date(details.joinedAt);
                    info += "\n\tJoined: " + (joined.getMonth()+1) + "/" + joined.getDate() + "/" + joined.getFullYear() + " " + joined.getHours() + ":" + joined.getMinutes();
                    bot.sendMessage(msg.channel, info);
                });
            } else {
                console.log(prettyDate() + "[WARN] Requested member does not exist");
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
function rssfeed(bot, msg, url, count, full){
    if(count > 4 || !count || count=="" || count=="null") {
        count = 4;
    }
    var FeedParser = require('feedparser');
    var feedparser = new FeedParser();
    request(url).pipe(feedparser);
    feedparser.on('error', function(error){
        console.log(prettyDate() + "[ERROR] Failed to read requested feed.");
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
        if(!configs.servers[bot.servers[i].id]) {
            defaultConfig(bot.servers[i]);
        }
        botOn[bot.servers[i].id] = true;
        cleverOn[bot.servers[i].id] = true;
        spams[bot.servers[i].id] = {};
        clearMessageCounter();
        bot.sendMessage(bot.servers[i].defaultChannel, "*I am " + bot.user.username + " v" + version + " by @anandroiduser, https://git.io/v2e1w*");
    }

    // Set up webserver for online bot status, optimized for RedHat OpenShift deployment
    var http = require('http');
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
                console.log(prettyDate() + "[ERROR] Failed to write web interface");
                html = bot.user.username + " v" + version + " running for " + secondsToString(bot.uptime/1000);
            }
            response.end(html);
        }
    });
    server.listen(server_port, server_ip_address, function() {
        console.log(prettyDate() + "[INFO] Opened web interface on " + server_ip_address + ", server port " + server_port)
    });
    
    // Ready to go!
	console.log(prettyDate() + "[INFO] Connected, serving in " + bot.channels.length + " channels");
});

bot.on("message", function (msg, user) {
    try {
        // Stuff that only applies to PMs
        if(msg.channel.isPrivate) {
            // Admin control panel, check to make sure we're on PM and config command was valid
            if(msg.content.indexOf("config ")>-1 && msg.content.length>7 && !adminconsole[msg.author.id]) {
                var svr = bot.servers.get("name", msg.content.substring(msg.content.indexOf(" ")+1));
                // Check if specified server exists
                if(!svr) {
                    console.log(prettyDate() + "[WARN] User " + msg.author.username + " provided invalid server for admin console");
                    bot.sendMessage(msg.channel, "Sorry, invalid server. Try again?");
                // Check if sender is an admin of the specified server
                } else if(configs.servers[svr.id].admins.indexOf(msg.author.id)>-1) {
                    // Check to make sure no one is already using the console
                    if(!activeAdmins(svr.id)) {
                        // Ok, all conditions met, logged into admin console
                        adminconsole[msg.author.id] = svr.id;
                        console.log(prettyDate() + "[INFO] Admin wizard launched by " + msg.author.username + " for " + svr.name);
                        
                        // Display options for the admin
                        var info = "Welcome to the admin console for server " + svr.name + ". Your options are:";
                        var params = ["username or ID to add/remove", "username or ID to block/unblock", "new member greeting", "feed name to remove, `<url> <name>` to add, or y/n", "enabled? y/n", "enabled? y/n", "enabled? y/n", "enabled? y/n", "enabled? y/n", "allow? y/n", "allow? y/n", "allow? y/n", "allow? y/n", "allow? y/n", "allow? y/n", "allow? y/n", "allow? y/n", "allow? y/n", "allow? y/n", "allow? y/n", "allow? y/n", "allow? y/n", "enabled? y/n", "enabled? y/n", "enabled?y/n"];
                        info += "\n\t 0: quit";
                        for(var i=0; i<Object.keys(configs.servers[svr.id]).length-1; i++) {
                            info += "\n\t " + (i+1) + ": " + Object.keys(configs.servers[svr.id])[i] + ", " + params[i];
                        }
                        info += "\n\t 23: remove bot from this server";
                        info += "\n\t 24: close all ongoing polls and trivia games";
                        info += "\n\t 25: extension, name of extension to delete"
                        info += "\n\t 26: display all current settings";
                        info += "\nUse the syntax `<no. of option> <parameter>`, or PM me a JSON file to set up an extension (to learn more about this, go to https://git.io/vg5mc)";
                        bot.sendMessage(msg.channel, info);
                        admintime[msg.author.id] = setTimeout(function() {
                            if(adminconsole[msg.author.id]) {
                                console.log(prettyDate() + "[INFO] Timeout on " + msg.author.username + "'s admin console session for " + svr.name);
                                delete adminconsole[msg.author.id];
                                bot.sendMessage(msg.channel, "It's been 3 minutes, so I'm assuming you're done here. Goodbye!");
                            }
                        }, 180000);
                    } else {
                        console.log(prettyDate() + "[WARN] Admin console for " + svr.name + " already active");
                        bot.sendMessage(msg.channel, "Another admin is in the console already. Please try again later.");
                    }
                } else {
                    console.log(prettyDate() + "[WARN] User " + msg.author.username + " is not a bot admin of " + svr.name);
                    bot.sendMessage(msg.channel, "You are not an admin for that server.");
                }
                return;
            // Check if this is an admin command
            } else if(adminconsole[msg.author.id]) {
                clearTimeout(admintime[msg.author.id]);
                admintime[msg.author.id] = setTimeout(function() {
                    if(adminconsole[msg.author.id]) {
                        console.log(prettyDate() + "[INFO] Timeout on " + msg.author.username + "'s admin console session for " + svr.name);
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
                            } else if(["keyword", "command"].indexOf(extension.type.toLowerCase())==-1) {
                                validity = "invalid type";
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
                                console.log(prettyDate() + "[WARN] Extension by " + msg.author.username + " is invalid: " +  validity);
                                bot.sendMessage(msg.channel, "Well, that didn't work. Here's the error: `" + validity + "`");
                            } else {
                                configs.servers[svr.id].extensions[extension.name] = extension;
                                console.log(prettyDate() + "[INFO] Extension " + extension.name + " added to server " + svr.name);
                                delete configs.servers[svr.id].extensions[extension.name].name;
                                saveConfig("./config.json", function(err) {
                                    if(err) {
                                        console.log(prettyDate() + "[ERROR] Could not save new config for " + svr.name);
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
                            console.log(prettyDate() + "[WARN] Invalid extension file provided by " + msg.author.username);
                            bot.sendMessage(msg.channel, "Hmmm, couldn't process that. Make sure the file is a valid JSON.");
                        }
                    });
                } else {
                    // Parses option number in message
                    var n = parseInt(msg.content);
                    if(msg.content.indexOf(" ")>-1) {
                        n = parseInt(msg.content.substring(0, msg.content.indexOf(" ")));
                        var suffix = msg.content.substring(msg.content.indexOf(" ")+1);
                    }
                    if(isNaN(n) && msg.attachments.length==0) {
                        console.log(prettyDate() + "[WARN] " + msg.author.username + " provided an invalid admin console option");
                        bot.sendMessage(msg.channel, "Invalid option, try again.");
                        return;
                    }
                    if(n>0 && n<17 && !suffix) {
                        console.log(prettyDate() + "[WARN] " + msg.author.username + " did not provide a parameter for option " + n);
                        bot.sendMessage(msg.channel, "Missing parameter. Please see your options above.");
                        return;
                    }
                    
                    // Do different things based on n
                    switch(n) {
                        // Exit admin console
                        case 0:
                            delete adminconsole[msg.author.id];
                            bot.sendMessage(msg.channel, "Goodbye!");
                            console.log(prettyDate() + "[INFO] Admin wizard for " + svr.name + " closed");
                            return;
                        // Add/remove users from admins list for this server
                        case 1:
                            if(isNaN(suffix)) {
                                var usr = svr.members.get("username", suffix);
                            } else {
                                var usr = svr.members.get("id", suffix);
                            }
                            var info = "";
                            if(!usr) {
                                console.log(prettyDate() + "[WARN] Member not found for admin list in " + svr.name);
                                bot.sendMessage(msg.channel, "Sorry, no such user.");
                                return;
                            } else if(configs.servers[svr.id].admins.indexOf(usr.id)>0) {
                                console.log(prettyDate() + "[INFO] Removed " + usr.username + " as a bot admin in " + svr.name);
                                configs.servers[svr.id].admins.splice(configs.servers[svr.id].admins.indexOf(usr.id), 1);
                                info += usr.username + " is no longer a server admin.";
                            } else {
                                console.log(prettyDate() + "[INFO] Added " + usr.username + " as a bot admin in " + svr.name);
                                configs.servers[svr.id].admins[configs.servers[svr.id].admins.length] = usr.id;
                                info += usr.username + " is now a server admin.";
                            }
                            info += "\nUpdated admins list for this server:";
                            for(var i=0; i<configs.servers[svr.id].admins.length; i++) {
                                info += "\n\t" + bot.users.get("id", configs.servers[svr.id].admins[i]).username + ", ID " + configs.servers[svr.id].admins[i];
                            }
                            saveConfig("./config.json", function(err) {
                                if(err) {
                                    console.log(prettyDate() + "[ERROR] Could not save new config for " + svr.name);
                                    bot.sendMessage(msg.channel, "An unknown error occurred.");
                                } else {
                                    bot.sendMessage(msg.channel, info);
                                }
                            });
                            break;
                        // Block/unblock users
                        case 2:
                            if(isNaN(suffix)) {
                                var usr = svr.members.get("username", suffix);
                            } else {
                                var usr = svr.members.get("id", suffix);
                            }
                            var info = "";
                            if(!usr) {
                                console.log(prettyDate() + "[WARN] Member not found to block in " + svr.name);
                                bot.sendMessage(msg.channel, "Sorry, no such user.");
                                return;
                            } else if(configs.servers[svr.id].blocked.indexOf(usr.id)>-1) {
                                console.log(prettyDate() + "[INFO] Unblocked " + usr.username + " in " + svr.name);
                                configs.servers[svr.id].blocked.splice(configs.servers[svr.id].blocked.indexOf(usr.id), 1);
                                info += "Removed user " + usr.username + " from blocked list.";
                            } else {
                                if(configs.servers[svr.id].indexOf(usr.id)>-1) {
                                    console.log(prettyDate() + "[WARN] " + usr.username + " cannot block another bot admin in " + svr.name);
                                    bot.sendMessage(msg.channel, "You can't block other bot admins in the server. That would be mean.");
                                } else if(usr.id == msg.author.id) {
                                    console.log(prettyDate() + "[WARN] " + usr.username + " cannot block themselves in " + svr.name);
                                    bot.sendMessage(msg.channel, "You can't block yourself! Lol");
                                } else {
                                    console.log(prettyDate() + "[INFO] Blocked " + usr.username + " in " + svr.name);
                                    configs.servers[svr.id].blocked[configs.servers[svr.id].blocked.length] = usr.id;
                                    info += "Blocked user " + usr.username + " from using this bot in this server.";
                                }
                            }
                            info += "\nUpdated blocked list for this server:";
                            for(var i=0; i<configs.servers[svr.id].blocked.length; i++) {
                                info += "\n\t" + bot.users.get("id", configs.servers[svr.id].blocked[i]).username + ", ID " + configs.servers[svr.id].blocked[i];
                            }
                            if(configs.servers[svr.id].blocked.length==0) {
                                info += "\n\tNo users are blocked.";
                            }
                            saveConfig("./config.json", function(err) {
                                if(err) {
                                    console.log(prettyDate() + "[ERROR] Could not save new config for " + svr.name);
                                    bot.sendMessage(msg.channel, "An unknown error occurred.");
                                } else {
                                    bot.sendMessage(msg.channel, info);
                                }
                            });
                            break;
                        // Change the new member greeting
                        case 3:
                            configs.servers[svr.id].newgreeting = suffix;
                            saveConfig("./config.json", function(err) {
                                if(err) {
                                    console.log(prettyDate() + "[ERROR] Could not save new config for " + svr.name);
                                    bot.sendMessage(msg.channel, "An unknown error occurred.");
                                } else {
                                    console.log(prettyDate() + "[INFO] New greeting in " + svr.name + ": " + suffix);
                                    bot.sendMessage(msg.channel, "The greeting message for new members will now include: " + suffix);
                                }
                            });
                            break;
                        // Adds, removes, and turns on/off RSS feeds
                        case 4:
                            var info = "";
                            if(suffix.toLowerCase()=="y" || suffix.toLowerCase()=="n") {
                                info = "Command `" + Object.keys(configs.servers[svr.id])[n-1] + "` has been turned ";
                                var yn = "";
                                if(suffix.toLowerCase()=="y") {
                                    configs.servers[svr.id].rss[0] = true;
                                    yn = "on";
                                } else if(suffix.toLowerCase()=="n") {
                                    configs.servers[svr.id].rss[0] = false;
                                    yn = "off";
                                }
                                info += yn;
                                console.log(prettyDate() + "[INFO] Command " + Object.keys(configs.servers[svr.id])[n-1] + " turned " + yn + " in " + svr.name);
                            } else if(suffix.indexOf(" ")>-1) {
                                var url = suffix.substring(0, suffix.indexOf(" "));
                                var nm = suffix.substring(suffix.indexOf(" ")+1);
                                if(nm.indexOf(" ")>-1) {
                                    console.log(prettyDate() + "[WARN] Invalid feed name provided in admin console for " + svr.name);
                                    info += "Invalid feed name.";
                                } else {
                                    configs.servers[svr.id].rss[1][configs.servers[svr.id].rss[1].length] = url;
                                    configs.servers[svr.id].rss[2][configs.servers[svr.id].rss[2].length] = nm;
                                    console.log(prettyDate() + "[INFO] Feed " + nm + " added in " + svr.name);
                                    info += "Feed " + nm + " added.";
                                }
                            } else {
                                if(configs.servers[svr.id].rss[2].indexOf(suffix)>-1) {
                                    configs.servers[svr.id].rss[1].splice(configs.servers[svr.id].rss[2].indexOf(suffix), 1);
                                    configs.servers[svr.id].rss[2].splice(configs.servers[svr.id].rss[2].indexOf(suffix), 1);
                                    console.log(prettyDate() + "[INFO] Feed " + suffix + " removed in " + svr.name);
                                    info += "Removed feed " + suffix;
                                } else {
                                    info += "No matching feed found.";
                                }
                            }
                            saveConfig("./config.json", function(err) {
                                if(err) {
                                    console.log(prettyDate() + "[ERROR] Could not save new config for " + svr.name);
                                    bot.sendMessage(msg.channel, "There was an error saving your changes.");
                                } else {
                                    bot.sendMessage(msg.channel, info);
                                }
                            });
                            break;
                        // Server management
                        case 23:
                            bot.leaveServer(svr, function(error) {
                                if(error) {
                                    console.log(prettyDate() + "[ERROR] Failed to leave server " + svr.name);
                                    bot.sendMessage(msg.channel, "Failed to leave server.");
                                } else {
                                    delete configs.servers[svr.id];
                                    delete messages[svr.id];
                                    delete cleverOn[svr.id];
                                    console.log(prettyDate() + "[INFO] Left server " + svr.name);
                                    bot.sendMessage(msg.channel, bot.user.username + " has left " + svr.name);
                                }
                            });
                            break;
                        // Close polls and trivia games by force
                        case 24:
                            for(var i=0; i<svr.channels.length; i++) {
                                if(trivia[svr.channels[i].id]) {
                                    bot.sendMessage(svr.channels[i], "Sorry to interrupt your game, but an admin has closed this trivia session.");
                                    commands["trivia"].process(bot, {"channel": svr.channels[i]}, "end");
                                    console.log(prettyDate() + "[INFO] Closed trivia game in " + svr.channels[i].name + ", " + svr.name);
                                    delete trivia[svr.channels[i].id];
                                    bot.sendMessage(msg.channel, "Closed a trivia game in " + svr.channels[i].name);
                                }
                                var act = activePolls(svr.channels[i].id);
                                if(act) {
                                    bot.sendMessage(svr.channels[i], "The ongoing poll in this channel has been closed by an admin.");
                                    bot.sendMessage(svr.channels[i], pollResults(act, "The results are in", "and the winner is"));
                                    console.log(prettyDate() + "[INFO] Closed active poll in " + svr.channels[i].name + ", " + svr.name);
                                    delete polls[act];
                                    bot.sendMessage(msg.channel, "Closed a poll in " + svr.channels[i].name);
                                }
                            }
                            break;
                        // Delete an extension
                        case 25:
                            if(configs.servers[svr.id].extensions[suffix]) {
                                delete configs.servers[svr.id].extensions[suffix];
                                console.log(prettyDate() + "[INFO] Deleted extension " + suffix + " from " + svr.name);
                                var info = "Deleted extension " + suffix + " from this server.\nUpdated extension list:";
                                for(var ext in configs.servers[svr.id].extensions) {
                                    info += "\n\t" + ext + ", " + configs.servers[svr.id].extensions[ext].type;
                                }
                            } else {
                                console.log(prettyDate() + "[WARN] Extension " + suffix + " not found in " + svr.name);
                                bot.sendMessage(msg.channel, "Extension " + suffix + " isn't on this server.");
                            }
                            saveConfig("./config.json", function(err) {
                                if(err) {
                                    console.log(prettyDate() + "[ERROR] Could not save new config for " + svr.name);
                                    bot.sendMessage(msg.channel, "There was an error saving your changes.");
                                } else {
                                    bot.sendMessage(msg.channel, info);
                                }
                            });
                            break;
                        // Display all current options
                        case 26:
                            var info = "Bot admins:";
                            for(var i=0; i<configs.servers[svr.id].admins.length-1; i++) {
                                info += "\n\t" + bot.users.get("id", configs.servers[svr.id].admins[i]).username + ", ID " + configs.servers[svr.id].admins[i];
                            }
                            info += "\nBlocked users:";
                            for(var i=0; i<configs.servers[svr.id].blocked.length; i++) {
                                info += "\n\t" + bot.users.get("id", configs.servers[svr.id].blocked[i]).username + ", ID " + configs.servers[svr.id].blocked[i];
                            }
                            if(configs.servers[svr.id].blocked.length==0) {
                                info += "\n\tNo users are blocked.";
                            }
                            if(Object.keys(configs.servers[svr.id].extensions).length>0) {
                                info += "\nExtension list:";
                                for(var ext in configs.servers[svr.id].extensions) {
                                    info += "\n\t" + ext + ", " + configs.servers[svr.id].extensions[ext].type;
                                }
                            }
                            info += "\nRSS feeds:";
                            for(var i=0; i<configs.servers[svr.id].rss[2].length; i++) {
                                info += "\n\t" + configs.servers[svr.id].rss[2][i];
                            }
                            if(configs.servers[svr.id].rss[2].length==0) {
                                info += "\n\tNo RSS feeds available.";
                            }
                            if(configs.servers[svr.id].servermod) {
                                info += "\nBot will act as a server moderator.";
                                if(configs.servers[svr.id].newgreeting!="") {
                                    info += "\nSpecial message for new members: `" + configs.servers[svr.id].newgreeting + "`";
                                } else {
                                    info += "\nCustom new member message not set.";
                                }
                            }
                            info += "\nCommand settings:";
                            for(var i=5; i<Object.keys(configs.servers[svr.id]).length; i++) {
                                info += "\n\t " + Object.keys(configs.servers[svr.id])[i] + ", ";
                                if(configs.servers[svr.id][Object.keys(configs.servers[svr.id])[i]]) {
                                    info += "on";
                                } else {
                                    info += "off";
                                }
                            }
                            bot.sendMessage(msg.channel, info);
                            break;
                        // Commands settings (other than ones listed prior)
                        default:
                            if(n<0 || n>19) {
                                console.log(prettyDate() + "[WARN] Invalid command provided for admin console in " + svr.name);
                                bot.sendMessage(msg.channel, "Not a valid option.");
                                return;
                            }
                            var info = "Command `" + Object.keys(configs.servers[svr.id])[n-1] + "` has been turned ";
                            var yn = "";
                            if(suffix.toLowerCase()=="y") {
                                configs.servers[svr.id][Object.keys(configs.servers[svr.id])[n-1]] = true;
                                yn = "on";
                                info += yn;
                                console.log(prettyDate() + "[INFO] Command " + Object.keys(configs.servers[svr.id])[n-1] + " turned " + yn + " in " + svr.name);
                            } else if(suffix.toLowerCase()=="n") {
                                configs.servers[svr.id][Object.keys(configs.servers[svr.id])[n-1]] = false;
                                yn = "off";
                                info += yn;
                                console.log(prettyDate() + "[INFO] Command " + Object.keys(configs.servers[svr.id])[n-1] + " turned " + yn + " in " + svr.name);
                            } else {
                                console.log(prettyDate() + "[WARN] Invalid parameter provided for admin console in " + svr.name);
                                bot.sendMessage(msg.channel, "Invalid parameter.");
                                break;
                            }
                            saveConfig("./config.json", function(err) {
                                if(err) {
                                    console.log(prettyDate() + "[ERROR] Could not save new config for " + svr.name);
                                    bot.sendMessage(msg.channel, "There was an error saving your changes.");
                                } else {
                                    bot.sendMessage(msg.channel, info);
                                }
                            });
                    }
                }
                return;
            }
            
            // Add information to user profile
            if(msg.content.indexOf("profile ")==0) {
                if(msg.content.indexOf(",")==-1) {
                    console.log(prettyDate() + "[WARN] User " + msg.author.username + " did not specify parameters for profile data");
                    bot.sendMessage(msg.channel, "Please include the name of the value as well as the value itself, separated by a comma.");
                    return;
                }
                var key = msg.content.substring(8,msg.content.indexOf(","));
                var value = msg.content.substring(msg.content.indexOf(",")+1);
                if(["id", "status", "avatar"].indexOf(key.toLowerCase())>-1) {
                    console.log(prettyDate() + "[WARN] User " + msg.author.username + " tried to assign default profile value");
                    bot.sendMessage(msg.channel, "You can't change the value for " + key);
                    return;
                }
                var info = "";
                if(value==".") {
                    if(!profileData[msg.author.id]) {
                        console.log(prettyDate() + "[WARN] " + msg.author.username + " tried to delete a nonexistent profile value");
                        bot.sendMessage(msg.channel, "I didn't have anything for " + key + " in the first place.");
                        return;
                    }
                    info = "Deleted.";
                    delete profileData[msg.author.id][key];
                } else {
                    if(!profileData[msg.author.id]) {
                        profileData[msg.author.id] = {};
                    }
                    info = "Alright, got it!";
                    profileData[msg.author.id][key] = value;
                }
                saveConfig("./data.json", function(err) {
                    if(err) {
                        console.log(prettyDate() + "[ERROR] Failed to save profile data for " + msg.author.username);
                        bot.sendMessage(msg.channel, "Uh-oh, something went wrong. It wasn't you though.");
                    } else {
                        console.log(prettyDate() + "[INFO] Saved " + key + " for " + msg.author.username);
                        bot.sendMessage(msg.channel, info);
                    }
                });
                return;
            }
            
            // Join new servers via PM
            if((msg.content.indexOf("https://discord.gg")>-1 || msg.content.indexOf("https://discordapp.com/invite/")>-1)) {
                try {
                    bot.joinServer(msg.content, function(error, server) {
                        if(error) {
                            console.log(prettyDate() + "[WARN] Failed to join new server, most likely user error");
                            bot.sendMessage(msg.channel, "Failed to join server. Please check your invite URL.");
                        } else {
                            console.log(prettyDate() + "Joined server " + server.name);
                            defaultConfig(server);
                            botOn[server.id] = true;
                            messages[server.id] = 0;
                            cleverOn[server.id] = 0;
                            bot.sendMessage(msg.channel, "Successfully joined " + server.name);
                        }
                    });
                } catch(err) {
                    console.log(prettyDate() + "[ERROR] Failed to join new server");
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
                console.log(prettyDate() + "[INFO] Poll ended in " + ch.name + ", " + ch.server.name);
                return;
            }
            // Starts a poll in a given channel via private message
            if(msg.author.id != bot.user.id && msg.content.toLowerCase().indexOf("poll")==0) {
                var svr = bot.servers.get("name", msg.content.substring(msg.content.indexOf(" ")+1, msg.content.lastIndexOf(" ")));
                if(!svr) {
                    console.log(prettyDate() + "[WARN] Invalid server provided by " + msg.author.username + " for new poll");
                    bot.sendMessage(msg.channel, "That server doesn't exist or I'm not on it.");
                } else if(botOn[svr.id]) {
                    var ch = svr.channels.get("name", msg.content.substring(msg.content.lastIndexOf(" ")+1));
                    if(!ch) {
                        console.log(prettyDate() + "[WARN] Invalid channel provided by " + msg.author.username + " for new poll");
                        bot.sendMessage(msg.channel, "Invalid channel.");
                    } else {
                        if(configs.servers[svr.id].poll) {
                            if(polls[msg.author.id]) {
                                console.log(prettyDate() + "[WARN] " + msg.author.username + " has already started a poll");
                                bot.sendMessage(msg.channel, "You've already started a poll. Close it before starting a new one.");
                            } else if(!activePolls(ch.id)) {
                                polls[msg.author.id] = {open: false, channel: ch.id, title: "", options: [], responderIDs: [], responses: []};
                                console.log(prettyDate() + "[INFO] Poll started by " + msg.author.username + " in " + ch.name + ", " + ch.server.name);
                                bot.sendMessage(msg.channel, "Enter the poll title or question:");
                            } else {
                                console.log(prettyDate() + "[WARN] Poll already active in " + ch.name + ", " + ch.server.name);
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
        }

        // Stuff that only applies to public messages
        var extensionApplied = false;
        if(!msg.channel.isPrivate) {
            // Count new message
            messages[msg.channel.server.id]++;
            
            // If start statement is issued, say hello and begin listening
            if(msg.content.indexOf(bot.user.mention()) == 0 && msg.content.indexOf("start") > -1 && configs.servers[msg.channel.server.id].admins.indexOf(msg.author.id)>-1 && !botOn[msg.channel.server.id]) {
                console.log(prettyDate() + "[INFO] Bot has been started by an admin in " + msg.channel.server.name);
                botOn[msg.channel.server.id] = true;
                bot.sendMessage(msg.channel, "Hello!");
                return;
            }
            
            // Stop responding if the author is a blocked user or bot isn't on
            if(configs.servers[msg.channel.server.id].blocked.indexOf(msg.author.id)>-1 || !botOn[msg.channel.server.id]) {
                return;
            }
            
            // Check for spam
            if(msg.author.id!=bot.user.id && configs.servers[msg.channel.server.id].spamfilter && msg.content.indexOf("<@120569499517714432> trivia")!=0) {
                if(configs.servers[msg.channel.server.id].admins.indexOf(msg.author.id)==-1) {
                    // Tracks spam for a user with each new message, expires after 45 seconds
                    if(!spams[msg.channel.server.id][msg.author.id]) {
                        spams[msg.channel.server.id][msg.author.id] = [];
                        spams[msg.channel.server.id][msg.author.id][spams[msg.channel.server.id][msg.author.id].length] = msg.content;
                        setTimeout(function() {
                            delete spams[msg.channel.server.id][msg.author.id];
                        }, 45000);
                    // Add a message to the user's spam list if it is similar to the last one
                    } else if(levenshtein.get(spams[msg.channel.server.id][msg.author.id][spams[msg.channel.server.id][msg.author.id].length-1], msg.content)<3) {
                        console.log(prettyDate() + "[INFO] Adding message from " + msg.author.username + " in " + msg.channel.server.name + " to their spam list");
                        spams[msg.channel.server.id][msg.author.id][spams[msg.channel.server.id][msg.author.id].length] = msg.content;
                        
                        // First-time spam warning 
                        if(spams[msg.channel.server.id][msg.author.id].length == 5) {
                            console.log(prettyDate() + "[INFO] Handling spam from " + msg.author.username);
                            bot.sendMessage(msg.author, "Stop spamming. The chat mods have been notified about this.");
                            adminMsg(false, msg.channel.server, msg.author, " is spamming " + msg.channel.server.name);
                        // Second-time spam warning, bans user from using bot
                        } else if(spams[msg.channel.server.id][msg.author.id].length == 10) {
                            console.log(prettyDate() + "[INFO] Blocking " + msg.author.username + " after second-time spam");
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
                            console.log(prettyDate() + "[WARN] User used incorrect voting syntax in " + msg.channel.name + ", " + msg.channel.server.name);
                            bot.sendMessage(msg.channel, msg.author + " Use the syntax `@" + bot.user.username + " vote <no. of choice>`");
                            return;
                        }
                        if(polls[act].responderIDs.indexOf(msg.author.id)==-1 && vt<polls[act].options.length && vt>=0) {
                            polls[act].responses[polls[act].responses.length] = vt;
                            polls[act].responderIDs[polls[act].responderIDs.length] = msg.author.id;
                            console.log(prettyDate() + "[INFO] Vote cast for " + vt + " by " + msg.author.username + " in " + msg.channel.name + ", " + msg.channel.server.name);
                        } else {
                            console.log(prettyDate() + "[WARN] Could not cast " + msg.author.username + "'s vote in " + msg.channel.name + ", " + msg.channel.server.name);
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
                        if(extension.channels.indexOf(msg.channel.name)==-1) {
                            continue;
                        }
                    }
                    
                    if((extension.type.toLowerCase()=="keyword" && contains(extension.key, msg.content, extension.case)) || (extension.type.toLowerCase()=="command" && msg.content.indexOf(bot.user.mention() + " " + extension.key)==0)) {
                        console.log(prettyDate() + "[INFO] Treating \"" + msg.content + "\" from " + msg.author.username + " in " + msg.channel.server.name + " as an extension " + configs.servers[msg.channel.server.id].extensions[ext].type);
                        extensionApplied = true;
                        
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
                                    console.log(prettyDate() + "[WARN] Extension " + configs.servers[msg.channel.server.id].extensions[ext].type + " in " + msg.channel.server.name + " produced no output");
                                } else {
                                    bot.sendMessage(msg.channel, params.send);
                                }
                            };
                            wait(0);
                        } catch(runError) {
                            console.log(prettyDate() + "[ERROR] Failed to run extension " + configs.servers[msg.channel.server.id].extensions[ext].type + " in " + msg.channel.server.name + ": " + runError);
                        }
                        break;
                    }
                }
            }

            // Google Play Store links bot
            if(msg.author.id!=bot.user.id && msg.content.toLowerCase().indexOf("linkme ")>-1 && configs.servers[msg.channel.server.id].linkme) {
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
                    console.log(prettyDate() + "[WARN] User did not provide an app to link in " + msg.channel.server.name);
                    bot.sendMessage(msg.channel, msg.author + " You need to give me an app to link!");
                    return;
                }
                
                // Fetch app links
                console.log(prettyDate() + "[INFO] " + msg.author.username + " requested the following app(s) in " + msg.channel.server.name + ": " + apps);
                for(var i=0; i<apps.length; i++) {
                    var basePath = "https://play.google.com/store/search?&c=apps&q=" + apps[i] + "&hl=en";
                    var data;
                    // Scrapes Play Store search results webpage for information
                    request(basePath, function(error, res, chunk) {
                        if (!error && res.statusCode == 200) {
                            var scraper = require('./scrapers/search');
                            data = scraper.parse(chunk);
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
                                console.log(prettyDate() + "[WARN] App " + apps[i] + " not found to link in " + msg.channel.server.name);
                                send = msg.author + " Sorry, no such app exists.\n";
                            }
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
                var cmdTxt = msg.content.split(" ")[1].toLowerCase().toLowerCase();
                var advance = bot.user.mention().length+cmdTxt.length+2;
            } else {
                var cmdTxt = msg.content;
                var advance = 0;
            }
            var suffix = msg.content.substring(advance);
            var cmd = commands[cmdTxt];
            
            // Process commands
            if(cmd && !msg.channel.isPrivate && !extensionApplied) {
                if(configs.servers[msg.channel.server.id][cmdTxt] || ["rss", "quiet", "update", "year", "remindme", "help"].indexOf(cmdTxt.toLowerCase())>-1 && botOn[msg.channel.server.id]) {
                    if(filter.indexOf(suffix)>-1 && configs.servers[msg.channel.server.id].admins.indexOf(msg.author.id)==-1 && configs.servers[msg.channel.server.id].nsfwfilter && cmdTxt!="reddit") {
                        console.log(prettyDate() + "[INFO] Handling filtered query \"" + msg.content + "\" from " + msg.author.username + " in " +  msg.channel.server.name);
                        kickUser(msg, "is abusing the bot", "attempting to fetch NSFW content");
                    } else if(botOn[msg.channel.server.id]) {
                        console.log(prettyDate() + "[INFO] Treating \"" + msg.content + "\" from " + msg.author.username + " in " + msg.channel.server.name + " as a command");
                        cmd.process(bot, msg, suffix);
                    }
                }
            // Process message as chatterbot input if not a command
            } else if(msg.author.id != bot.user.id && !extensionApplied) {
                if(!msg.channel.isPrivate) {
                    if(!configs.servers[msg.channel.server.id].chatterbot || !botOn[msg.channel.server.id]) {
                        return;
                    }
                    console.log(prettyDate() + "[INFO] Treating \"" + msg.content + "\" from " + msg.author.username + " in " + msg.channel.server.name + " as chatterbot prompt"); 
                } else {
                    console.log(prettyDate() + "[INFO] Treating \"" + msg.content + "\" from " + msg.author.username + " as chatterbot prompt"); 
                }
                
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
                        bots[msg.author.id] = require('mitsuku-api')();
                    }
                    var ai = bots[msg.author.id];
                    ai.send(prompt)
                        .then(function(response) {
                            var res = response.replace("Mitsuku", bot.user.username);
                            if(!msg.channel.isPrivate) {
                                res = res.replace("Mousebreaker", bot.users.get("id", configs.servers[msg.channel.server.id].admins[0]).username);
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
                        });
                } else {
                    Cleverbot.prepare(function(){
                        cleverbot.write(prompt, function (response) {
                            if(msg.channel.isPrivate) {
                                bot.sendMessage(msg.channel, response.message);
                            } else {
                                bot.sendMessage(msg.channel, msg.author + " " + response.message);
                            }
                        });
                    });
                }
            }
        // Otherwise, check if it's a self-message or just does the tag reaction
        } else if(!extensionApplied) {
            if(msg.author == bot.user){
                return;
            }
            if(msg.author != bot.user && msg.isMentioned(bot.user) && configs.servers[msg.channel.server.id].tagreaction && botOn[msg.channel.server.id]) {
                console.log(prettyDate() + "[INFO] Tagged by " + msg.author.username + " in " + svr.name);
                bot.sendMessage(msg.channel,msg.author + ", you called?");
            }
        }
    } catch(mainError) {
        console.log(prettyDate() + "[ERROR] Failed to process new message");
        console.log(mainError);
    }
});

// Leave server if deleted
bot.on("serverDeleted", function(svr) {
    delete configs.servers[svr.id];
    delete messages[svr.id];
    delete cleverOn[svr.id];
    console.log(prettyDate() + "[INFO] Server " + svr.name + " removed, left server");
});

// New server member handling
bot.on("serverNewMember", function(svr, usr) {
    // Check if this has been enabled in admin console and the bot is listening
    if(configs.servers[svr.id].servermod && botOn[svr.id]) {
        console.log(prettyDate() + "[INFO] " + usr.username + " has joined " + svr.name);
        bot.sendMessage(svr.defaultChannel, greetings[getRandomInt(0, greetings.length-1)].replace("++", usr));
        var info = "Welcome to the " + svr.name + " Discord chat! " + configs.servers[svr.id].newgreeting + "\n\nI'm " + bot.user.username + " by the way. You can interact with me in any of the channels by tagging me with `@" + bot.user.username + "` and then stating any one of the following commands:" + getHelp(svr);
        bot.sendMessage(usr, info);
    }
});

// Message on user banned
bot.on("userBanned", function(usr, svr) {
    if(configs.servers[svr.id].servermod && botOn[svr.id]) {
        console.log(prettyDate() + "[INFO] User " + usr.username + " has been banned from " + svr.name);
        bot.sendMessage(svr.defaultChannel, usr.username + " has been banned.");
    }
});

// Message on user unbanned
bot.on("userUnbanned", function(usr, svr) {
    if(configs.servers[svr.id].servermod && botOn[svr.id]) {
        console.log(prettyDate() + "[INFO] User " + usr.username + " has been unbanned from " + svr.name);
        bot.sendMessage(svr.defaultChannel, usr.username + " is no longer banned.");
    }
});

// Attempt authentication if disconnected
bot.on("disconnected", function() {
    disconnects++;
    console.log(prettyDate() + "[ERROR] Disconnected from Discord, will try again in 5s");
    setTimeout(function() {
        bot.login(AuthDetails.email, AuthDetails.password);
    }, 5000);
})

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
    console.log(prettyDate() + "[INFO] New trivia question in " + bot.channels.get("id", chid).name);
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

// Clear message counter
function clearMessageCounter() {
    for(var svrid in configs.servers) {
        messages[svrid] = 0;
    }
    setTimeout(function() {
        clearMessageCounter();
    }, 86400000);
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

// Adds default settings for a server to config.json
function defaultConfig(svr) {
    if(!configs.servers[svr.id]) {
        var adminList = [svr.owner.id];
        try {
            for(var i=0; i<svr.members.length; i++) {
                if(svr.rolesOfUser(svr.members[i])) {
                    for(var j=0; j<svr.rolesOfUser(svr.members[i]).length; j++) {
                        if(svr.rolesOfUser(svr.members[i])[j].hasPermission("banMembers") && adminList.indexOf(svr.members[i].id)==-1 && svr.members[i].id!=bot.user.id) {
                            adminList[adminList.length] = svr.members[i].id;
                        }
                    }
                }
            }
        } catch(err) {
            console.log(prettyDate() + "[ERROR] Failed to auto-add admins in " + svr.name + ", using only the owner");
            console.log(err);
        }
        configs.servers[svr.id] = {
            admins: adminList,
            blocked: [],
            newgreeting: "",
            rss: [true, ["http://news.google.com/news?cf=all&hl=en&pz=1&ned=us&topic=h&num=3&output=rss"], ["gnews"]],
            servermod: true,
            spamfilter: true,
            nsfwfilter: true,
            chatterbot: true,
            linkme: true,
            convert: true,
            ping: true,
            youtube: true,
            image: true,
            gif: true,
            wiki: true,
            stock: true,
            reddit: true,
            roll: true,
            games: true,
            profile: true,
            tagreaction: true,
            poll: true,
            trivia: true,
            extensions: {}
        };
        saveConfig("./config.json", function(err) {
            if(err) {
                console.log(prettyDate() + "[ERROR] Failed to save default configs for server " + svr.name);
            } else {
                console.log(prettyDate() + "[INFO] Successfully saved default configs for " + svr.name);
            }
        });
    }
}

// Write an updated config.json file to disk
function saveConfig(file, callback) {
    var object = configs;
    if(file=="./data.json") {
        object = profileData;
    }
    fs.writeFile(file, JSON.stringify(object, null, 4), function(err) {
        callback(err);
    });
}

// Check if other admins of a server are logged into the console, return true if yes
function activeAdmins(svrid) {
    for(var i=0; i<configs.servers[svrid].admins.length; i++) {
        if(adminconsole[configs.servers[svrid].admins[i]]) {
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
    var info = "**" + intro + " for the poll: " + polls[usrid].title + "**";
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
    
    return info;
}

// Attempt to kick a member
function kickUser(msg, desc1, desc2) {
    bot.kickMember(msg.author, msg.channel.server, function(err) {
        if(err) {
            configs.servers[msg.channel.server.id].blocked[configs.servers[msg.channel.server.id].blocked.length] = msg.author.id;
            saveConfig("./config.json", function(error) {
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
			console.log(prettyDate() + "[ERROR] Could not connect to Google Images");
			return;
		}
		if(!data.items || data.items.length == 0 || query.indexOf("<#")>-1) {
            console.log(prettyDate() + "[WARN] No image results for " + query);
            callback(null);
		} else {
            callback(data.items[0].link);
		}
	});	
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
            console.log(prettyDate() + "[ERROR] Could not connect to Giphy");
        } else {
            try {
                var responseObj = JSON.parse(body)
                func(responseObj.data.id);
            } catch(err) {
                console.log(prettyDate() + "[ERROR] Failed to retreive GIF " + tags);
                func(undefined);
            }
        }
    }.bind(this));
}

// Get YouTube URL given tags as query
function ytSearch(query, cb) {
    var youtube = new youtube_node();
    youtube.setKey(AuthDetails.google_api_key);
    var q;
	youtube.search(query, 1, function(error, result) {
        if(error) {
            console.log(prettyDate() + "[ERROR] Could not connect to YouTube");
            q =  "`¯\_(ツ)_/¯`";
        } else {
            if (!result || !result.items || result.items.length < 1) {
                console.log(prettyDate() + "[WARN] No YouTube results for " + query);
                q = "`¯\_(ツ)_/¯`";
            } else if(result.items[0].id.videoId=="http://www.youtube.com/watch?v=undefined") {
                console.log(prettyDate() + "[WARN] No YouTube results for " + query);
                q = "`¯\_(ツ)_/¯`";
            } else {
                q = "http://www.youtube.com/watch?v=" + result.items[0].id.videoId;
            }
        }
        cb(q);
    });
}

// Message online bot admins in a server
function adminMsg(error, svr, author, info) {
    if(!error) {
        for(var i=0; i<configs.servers[svr.id].admins.length; i++) {
            var usr = bot.users.get("id", configs.servers[svr.id].admins[i]);
            if(usr.status!="offline" && usr) {
                bot.sendMessage(usr, "@" + author.username + info);
            }
        }
    } else {
        console.log(prettyDate() + "[ERROR] Failed to message bot admins of " + svr.name);
    }
}

// Ouput a pretty date for logging
function prettyDate() {
    var date = new Date();
    return "[" + date.getUTCFullYear() + "-" + ("0" + (date.getUTCMonth() + 1)).slice(-2) + "-" + ("0" + date.getUTCDate()).slice(-2) + " " + ("0" + date.getUTCHours()).slice(-2) + ":" + ("0" + date.getUTCMinutes()).slice(-2) + ":" + ("0" + date.getUTCSeconds()).slice(-2) + " UTC] ";
}

// Generate help text
function getHelp(svr) {
    var info = "";
    for(var cmd in commands) {
        if(configs.servers[svr.id][cmd] || ["rss", "quiet", "update", "year", "remindme", "help"].indexOf(cmd.toLowerCase())>-1) {
            info += "\n\t" + cmd;
            if(commands[cmd].usage) {
                info += commands[cmd].usage;
            }
        }
    }
    for(var ext in configs.servers[svr.id].extensions) {
        if(configs.servers[svr.id].extensions[ext].type.toLowerCase()=="command") {
            info += "\n\t" + configs.servers[svr.id].extensions[ext].key;
            if(configs.servers[svr.id].extensions[ext].usage) {
                info += configs.servers[svr.id].extensions[ext].usage;
            }
        }
    }

    if(configs.servers[svr.id].rss[2].length>-1) {
        info += "\nThe following RSS feeds are available:";
        for(var i=0; i<configs.servers[svr.id].rss[2].length; i++) {
            info += "\n\t" + configs.servers[svr.id].rss[2][i];
        }
    }

    info += "\n\nFor example, you could do `@" + bot.user.username + " remindme 5 s Hello`. You can also PM me to start a poll (`poll <server> <channel>`) or just talk to me about anything, and you can get app links from the Google Play store by using `linkme <some app>` in the main chat.\n\nVersion " + version + " by @anandroiduser, https://git.io/v2e1w";
    return info;
}

// Check for updates
function checkVersion() {
    unirest.post('http://awesomebot-botmakersinc.rhcloud.com/')
    .header('Accept', 'application/json')
    .end(function(response) {
        try {
            if(!response.body || !response.body[0]) {
                console.log(prettyDate() + "[ERROR] Failed to check for updates");
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
                console.log(prettyDate() + "[INFO] Found " + info + " new bot updates");
                var send = "There are " + info + " new updates available for " + bot.user.username;
                for(var i=0; i<outOfDate; i++) {
                    send += "\n\t" + (response.body[i][0] + "             ").slice(0,15);
                    if(response.body[i][1]) {
                        send += response.body[i][1];
                    }
                }
                send += "\nLearn more at https://git.io/vg5mc";
                
                if(configs.maintainer && configs.maintainer!="") {
                    var usr = bot.users.get("id", configs.maintainer);
                    if(usr) {
                        bot.sendMessage(usr, send);
                    }
                }
                console.log(send);
                console.log(prettyDate() + "[WARN] Could not message bot maintainer about new updates");
            } else {
                console.log(prettyDate() + "[INFO] " + bot.user.username + " is up-to-date");
            }
        } catch(error) {
            console.log(prettyDate() + "[ERROR] Failed to check for updates");
            console.log(error);
        }
    });
    
    setTimeout(checkVersion, 3600000);
}

// Login to the bot's Discord account
bot.login(AuthDetails.email, AuthDetails.password, function(err) {
    if(err) {
        console.log(prettyDate() + "[FATAL] Could not connect to Discord");
        process.exit();
    }
});
