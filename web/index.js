var loader = "light";
var ripple_dark = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid" class="uil-ripple"><rect x="0" y="0" width="100" height="100" fill="none" class="bk"></rect><g> <animate attributeName="opacity" dur="1s" repeatCount="indefinite" begin="0s" keyTimes="0;0.33;1" values="1;1;0"></animate><circle cx="50" cy="50" r="40" stroke="#e0f2f1" fill="none" stroke-width="10" stroke-linecap="round"><animate attributeName="r" dur="1s" repeatCount="indefinite" begin="0s" keyTimes="0;0.33;1" values="0;22;44"></animate></circle></g><g><animate attributeName="opacity" dur="1s" repeatCount="indefinite" begin="0.5s" keyTimes="0;0.33;1" values="1;1;0"></animate><circle cx="50" cy="50" r="40" stroke="#80cbc4" fill="none" stroke-width="10" stroke-linecap="round"><animate attributeName="r" dur="1s" repeatCount="indefinite" begin="0.5s" keyTimes="0;0.33;1" values="0;22;44"></animate></circle></g></svg>';
var ripple_light = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid" class="uil-ripple"><rect x="0" y="0" width="100" height="100" fill="none" class="bk"></rect><g> <animate attributeName="opacity" dur="1s" repeatCount="indefinite" begin="0s" keyTimes="0;0.33;1" values="1;1;0"></animate><circle cx="50" cy="50" r="40" stroke="#00695C" fill="none" stroke-width="10" stroke-linecap="round"><animate attributeName="r" dur="1s" repeatCount="indefinite" begin="0s" keyTimes="0;0.33;1" values="0;22;44"></animate></circle></g><g><animate attributeName="opacity" dur="1s" repeatCount="indefinite" begin="0.5s" keyTimes="0;0.33;1" values="1;1;0"></animate><circle cx="50" cy="50" r="40" stroke="#00796b" fill="none" stroke-width="10" stroke-linecap="round"><animate attributeName="r" dur="1s" repeatCount="indefinite" begin="0.5s" keyTimes="0;0.33;1" values="0;22;44"></animate></circle></g></svg>';
var statsSelect = "null";
var logID = "null";
var logLevel = "null";

function doSetup() {
    var param = Object.keys(getQueryParams(document.URL))[0];
    if(param) {
        if(param.indexOf("?auth")==param.length-5) {
            var token = getQueryParams(document.URL)[param];
            if(token) {
                checkAuth(token, true);
            } else {
                alert("Authentication failed");
                writeInterface();
            }
        } else {
            writeInterface();
        }
    } else {
        writeInterface();
    }
}

function getQueryParams(qs) {
    qs = qs.split("+").join(" ");

    var params = {};
    var tokens;
    var re = /[?&]?([^=]+)=([^&]*)/g;

    while(tokens = re.exec(qs)) {
        params[decodeURIComponent(tokens[1])] = decodeURIComponent(tokens[2]);
    }

    return params;
}
    
function writeInterface() {
    switchColors(localStorage.getItem("theme") || "contrast");
    showLoader();
    document.body.style.opacity = 1;
    
    getJSON("/data?section=list&type=bot", function(data) {
        document.title = data.username + " Status";
        document.getElementById("botname").innerHTML = data.username;
        document.getElementById("profilepic").src = data.avatar;
        
        getJSON("/data?section=list&type=servers", function(data) {
            for(var i=0; i<data.stream.length; i++) {
                document.getElementById("statsselect").innerHTML += "<option value=\"" + data.stream[i][1] + "\">" + data.stream[i][0] + "</option>";
            }
            
            switchStats("null", true);
            
            getJSON("/data?section=servers", function(data) {
                for(var i=0; i<data.stream.length; i++) {
                    document.getElementById("servertablebody").innerHTML += "<tr><td><img class=\"profilepic\" width=25 src=\"" + data.stream[i][0] + "\" /></td><td>" + data.stream[i][1] + "</td><td>" + data.stream[i][2] + "</td><td>" + data.stream[i][3] + "</td><td>" + data.stream[i][4] + "</td></tr>";
                }
                
                getJSON("/data?section=list&type=logids", function(data) {
                    for(var i=0; i<data.stream.length; i++) {
                        if(!isNaN(parseInt(data.stream[i][1]))) {
                            document.getElementById("idselector").innerHTML += "<option id=\"id-" + data.stream[i][1] + "\" value=\"" + data.stream[i][1] + "\">@" + data.stream[i][0] + "</option>";
                        } else {
                            document.getElementById("idselector").innerHTML += "<option id=\"id-" + data.stream[i][0] + "\" value=\"" + data.stream[i][0] + "\">" + data.stream[i][0] + "</option>";
                        }
                    }
                    
                    switchLog(true);
                    
                    setTimeout(function() {
                        destroyLoader();
                    }, 750);
                });
            });
        });
    });
}

function showLoader() {
    document.getElementById("darkener").style.display = "";
    document.body.innerHTML += "<div id=\"loader\"><center>" + (loader=="dark" ? ripple_dark : ripple_light) + "</center></div>";
    if(loader=="dark") {
        document.getElementById("loader").style.backgroundColor = "#212121";
    } else {
        document.getElementById("loader").style.backgroundColor = "#EEEEEE";
    }
    document.getElementById("loader").style.opacity = 1;
    document.body.style.overflow = "hidden";
}

function destroyLoader() {
    document.body.style.overflow= "auto";
    document.getElementById("loader").style.opacity = 0;
    document.body.removeChild(document.getElementById("loader"));
    document.getElementById("darkener").style.display = "none";
}

function colorLinks(hex) {
    var links = document.getElementsByTagName("a");
    for(var i=0; i<links.length; i++) {
        if(links[i].href) {
            links[i].style.color = hex;
        }
    }
}
function switchColors(n) {
    localStorage.setItem("theme", n);
    setTimeout(function() {
        document.getElementById("themeswitcher").value = n;
        document.getElementById("theme-" + n).selected = true;
    }, 250);
    
    if(["black", "dark", "blue", "red", "deep"].indexOf(n)>-1) {
        loader = "dark";
        document.body.style.color = "#EEEEEE";
        colorLinks("#BDBDBD");
    }
    if(["white", "contrast"].indexOf(n)>-1) {
        loader = "light";
        colorLinks("#212121");
    }
    
    switch(n) {
        case "white":
            document.body.style.backgroundColor = "white";
            document.body.style.color = "black";
            break;
        case "contrast":
            document.body.style.backgroundColor = "#EEEEEE";
            break;
        case "black":
            document.body.style.backgroundColor = "black";
            break;
        case "dark":
            document.body.style.backgroundColor = "#212121";
            break;
        case "blue":
            document.body.style.backgroundColor = "#263238";
            break;
        case "red":
            document.body.style.backgroundColor = "#B71C1C";
            break;
        case "deep":
            document.body.style.backgroundColor = "#004D40";
            break;
    }
    
    var contrastables = document.querySelectorAll(".contrastable");
    for(var i=0; i<contrastables.length; i++) {
        contrastables[i].style.backgroundColor = document.body.style.backgroundColor.slice(0);
        contrastables[i].style.color = document.body.style.color.slice(0);
    }
    
    if(n=="contrast") {
        document.body.style.color = "#212121";
        for(var i=0; i<contrastables.length; i++) {
            contrastables[i].style.backgroundColor = "#212121";
            contrastables[i].style.color = "#F5F5F5";
        } 
    }
}

function switchStats(n, nodestroy) {
    document.getElementById("stats").style.opacity = 0;
    document.getElementById("stats").style.height = 0;
    showLoader();
    
    statsSelect = n;
    document.getElementById("statsselect").value = n;
    setTimeout(function() {
        var html = "";
        if(n=="null") {
            document.getElementById("profileselect").style.opacity = 0;
            setTimeout(function() {
                document.getElementById("profileselect").style.visibility = "hidden";
            }, 250);
            getJSON("/data?section=list&type=bot", function(data) {
                html = "<b>Status:</b> Online<br><b>Bot ID:</b> " + data.id + "<br><b>Version:</b> v" + data.version + "<br><b>Uptime:</b> " + (data.uptime || "<i>None, how are you viewing this?</i>") + "<br><b>Disconnections:</b> " + data.disconnects + " so far";
                
                document.getElementById("stats").innerHTML = html || "<i>Nothing here</i>";
                document.getElementById("stats").style.height = (document.getElementById("stats").innerHTML.match(/<br>/ig).length + 1) * 18;
                document.getElementById("stats").style.opacity = 1;
                if(!nodestroy) {
                    setTimeout(function() {
                        destroyLoader();
                    }, 250);
                }
            });
        } else {
            document.getElementById("profileselect").style.visibility = "visible";
            document.getElementById("profileselect").style.opacity = 1;
            
            getJSON("/data?section=stats&type=server&svrid=" + n, function(data) {
                html = "<b>" + data.name + " (this week)</b>" + (Object.keys(data).length>1 ? "" : "<br><i>Nothing here</i>");
                if(Object.keys(data).length>1) {
                    for(var cat in data) {
                        if(cat!="name") {
                            html += "<br>" + cat + ":" + (cat=="Data since" ? (" " + data[cat]) : "");;
                            if(cat!="Data since") {
                                for(var i=0; i<data[cat].length; i++) {
                                    html += "<br>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;" + data[cat][i];
                                }
                            }
                        }
                    }
                }
                
                getJSON("/data?section=list&type=members&svrid=" + n, function(data) {
                    document.getElementById("profileselect").innerHTML = "<option value=\"null-" + n + "\" selected>View Profile</option>";
                    for(var i=0; i<data.stream.length; i++) {
                        document.getElementById("profileselect").innerHTML += "<option value=\"" + data.stream[i][1] + "-" + n + "\">" + data.stream[i][0] + "</option>";
                    }
                    
                    document.getElementById("stats").innerHTML = html || "<i>Nothing here</i>";
                    document.getElementById("stats").style.height = (document.getElementById("stats").innerHTML.match(/<br>/ig).length + 1) * 18;
                    document.getElementById("stats").style.opacity = 1;
                    setTimeout(function() {
                        destroyLoader();
                    }, 250);
                });
            });
        }
    }, 125);
}

function switchProfile(n) {
    document.getElementById("stats").style.opacity = 0;
    document.getElementById("stats").style.height = 0;
    showLoader();
    
    document.getElementById("profileselect").value = n;
    if(statsSelect) {
        document.getElementById("statsselect").value = statsSelect;
    }
    setTimeout(function() {
        var usrid = n.substring(0, n.indexOf("-"));
        var svrid = n.substring(n.indexOf("-")+1);
        var html = "";
        
        if(usrid=="null") {
            switchStats(svrid);
        } else {
            getJSON("/data?section=stats&type=profile&usrid=" + usrid + "&svrid=" + svrid, function(data) {
                for(var sect in data) {
                    html += "<b>" + sect + ":</b><br>";
                    for(var key in data[sect]) {
                        if(key=="Avatar") {
                            html += "&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;" + key + ": <a href='" + data[sect][key] + "'>Click Here</a><br>";
                        } else {
                            html += "&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;" + key + ": " + data[sect][key] + "<br>";
                        }
                    }
                }
                html = html.substring(0, html.length-4);
                
                document.getElementById("stats").innerHTML = html || "<i>Nothing here</i>";
                document.getElementById("stats").style.height = (document.getElementById("stats").innerHTML.match(/<br>/ig).length + 1) * 18;
                document.getElementById("stats").style.opacity = 1;
                switchColors(localStorage.getItem("theme") || "contrast");
                setTimeout(function() {
                    destroyLoader();
                }, 250);
            });
        }
    }, 125);
}

function switchLogID(n) {
    setTimeout(function() {
        document.getElementById("id-" + n).selected = true;
    }, 1);
    logID = n=="null" ? null : n;
    switchLog();
}

function switchLogLevel(n) {
    setTimeout(function() {
        document.getElementById("level-" + n).selected = true;
    }, 1);
    logLevel = n=="null" ? null : n;
    switchLog();
}

function switchLog(nodestroy) {
    var ogcolor = document.getElementById("console").style.color.slice(0);
    document.getElementById("console").style.color = document.getElementById("console").style.backgroundColor;
    showLoader();
    
    if(logID) {
        document.getElementById("id-" + logID).selected = true;
    }
    if(logLevel) {
        document.getElementById("level-" + logLevel).selected = true;
    }
    setTimeout(function() {
        var html = "";
        
        getJSON("/data?section=log" + (logID ? "&id=" + encodeURI(logID) : "") + (logLevel ? "&level=" + encodeURI(logLevel) : ""), function(data) {
            if(data.stream.length>0) {
                for(var i=0; i<data.stream.length; i++) {
                    html += data.stream[i] + "<br>";
                }
            }
            
            document.getElementById("console").innerHTML = html || "<i>Nothing here</i>";
            document.getElementById("console").scrollTop = document.getElementById("console").scrollHeight;document.getElementById("console").style.color = ogcolor;
            if(!nodestroy) {
                setTimeout(function() {
                    destroyLoader();
                }, 250);
            }
        });    
    }, 125);
}

function checkAuth(token, write) {
    getJSON("/data?auth=" + token, function(data) {
        if(Object.keys(data).length>0) {
            localStorage.setItem("auth", JSON.stringify(data));
            document.body.style.opacity = 1;
            setTimeout(function() {
                if(data.type=="maintainer") {
                    window.location.replace("/maintainer");
                } else if(data.type=="admin") {
                    window.location.replace("/admin");
                }
            }, 250);
        } else {
            alert("Authentication failed");
            if(write) {
                writeInterface();
            } else {
                document.getElementById("authinput").value = "";
            }
        }
    });
}

function getJSON(url, callback) {
    var xhr = new XMLHttpRequest();
    xhr.open("get", url, true);
    xhr.responseType = "json";
    xhr.onload = function() {
    var status = xhr.status;
        if(status==200) {
            callback(xhr.response);
        }
    };
    try {
        xhr.send();
    } catch(err) {
        setTimeout(function() {
            getJSON(url, callback);
        }, 500);
    }
};
