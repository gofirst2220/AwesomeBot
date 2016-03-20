var authtoken;
var authtype;

function doAuth() {
    switchColors(localStorage.getItem("theme") || "contrast");
    showLoader();
    document.body.style.opacity = 1;
    
    if(localStorage.getItem("auth")) {
        var auth = JSON.parse(localStorage.getItem("auth"));
        authtoken = auth.token;
        authtype = auth.type;
        getJSON("/data/?auth=" + authtoken + "&type=" + auth.type, function(data) {
            if(Object.keys(data).length>0) {
                if(authtype=="maintainer") {
                    doMaintainerSetup(data);
                } else if(authtype=="admin") {
                    doAdminSetup(data);
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
    xhr.open("post", "/config?auth=" + authtoken + "&type=" + authtype, true);
    xhr.setRequestHeader("Content-Type", "application/json; charset=UTF-8");
    xhr.send(JSON.stringify(data));
    xhr.onloadend = function() {
        callback(xhr.status);
    };
}

function config(key, value, callback) {
    showLoader();
    var data = {};
    data[key] = value;
    postJSON(data, function(response) {
        if(response==200) {
            getJSON("/data/?auth=" + authtoken + "&type=" + authtype, function(mData) {
                if(Object.keys(mData).length>0) {
                    botData = mData;
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