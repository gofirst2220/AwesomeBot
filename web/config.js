var authtoken;
var authtype;
var botData;

function doAuth() {
    switchColors(localStorage.getItem("theme") || "contrast");
    showLoader();
    document.body.style.opacity = 1;
    
    if(localStorage.getItem("auth")) {
        var auth = JSON.parse(localStorage.getItem("auth"));
        authtoken = auth.token;
        authtype = auth.type;
        getJSON("/data/?auth=" + authtoken + "&type=" + auth.type, function(data) {
            if(Object.keys(data).length>0 && (location.pathname+location.search).substr(1)==authtype) {
                botData = data;
                if(authtype=="maintainer") {
                    doMaintainerSetup();
                } else if(authtype=="admin") {
                    doAdminSetup();
                }
            } else {
                alert("Authentication failed");
                localStorage.removeItem("auth");
                document.location.replace("/");
            }
        });
    } else {
        alert("Authentication failed");
        document.location.replace("/");
    }
}

function postJSON(data, callback) {
    var xhr = new XMLHttpRequest();
    xhr.open("post", "/config?auth=" + authtoken + "&type=" + authtype + (authtype=="admin" ? ("&svrid=" + JSON.parse(localStorage.getItem("auth")).svrid + "&usrid=" + JSON.parse(localStorage.getItem("auth")).usrid) : ""), true);
    xhr.setRequestHeader("Content-Type", "application/json; charset=UTF-8");
    xhr.send(JSON.stringify(data));
    xhr.onloadend = function() {
        callback(xhr.status);
    };
}

function config(key, value, callback) {
    if(typeof value=="string" && value=="" && key!="newgreeting") {
        return;
    }
    
    showLoader();
    var data = {};
    data[key] = value;
    postJSON(data, function(response) {
        if(response==200) {
            getJSON("/data/?auth=" + authtoken + "&type=" + authtype, function(mData) {
                if(Object.keys(mData).length>0) {
                    botData = mData;
                    if(authtype=="admin") {
                        switchManage();
                    }
                    callback(false);
                    destroyLoader();
                } else {
                    alert("Session timeout");
                    localStorage.removeItem("auth");
                    document.location.replace("/");
                }
            });
        } else {
            alert("Error saving changes");
            callback(true);
            destroyLoader();
        }
    });
}

function doLogout() {
    var u = confirm("Logout of " + authtype + " console?");
    if(u) {
        postJSON({logout: JSON.parse(localStorage.getItem("auth")).usrid}, function(response) {
            if(response==200) {
                localStorage.removeItem("auth");
                window.close();
            } else {
                alert("Error logging out, wait 3 minutes to timeout");
            }
        });
    }
}