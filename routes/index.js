//Dependencies
var express = require('express');
var router = express.Router();
var request = require('request');
var async = require('async');

//Constants
const curl = "http://74.50.59.155:6000/api/";
const NUMBER_OF_PURCHASES = 5;

//Initialize Cache
var requestCache = [];

//Filter current cache array on username, may return array with size 0
var checkCache = function(username, callback){
    var cacheData = requestCache.filter(function(term){
        return(term.username == username);
    });

    callback(cacheData);
};

//Add response to cached data
var cacheData = function(username, data){
    var record = {};
    record.username = username;
    record.data = data;
    requestCache.push(record);
};

var getUserData = function(username, callback){
    var path = "users/";

    //This is the syntax for performing GET requests in the 'request' module.
    request(
        {method:'GET', uri: curl + path + username},
        function (err, response, body) {
            callback(JSON.parse(body));
        }
    );
};

var getRecentPurchases = function(req, res){
    var username = req.query.username;
    if(!username) {
        res.json({status: "notok", message: "Invalid username"});
    }else checkCache(username, function(cacheData){
        if(cacheData.length > 0){//If there is data cached for that username, return the data.
            console.log("Retreiving from cache.");
            res.json({status:"ok", popularPurchases:cacheData[0].data});
        }else{//If there is not data cached, perform the necessary backend calls.
            getUserData(username, function(userData){
                if(!userData.user){
                    res.json({status: "notok", message: "User with username of '{" + username + "}' was not found"});
                }else fetchUserPurchases(username, function(purchaseData){
                    res.json({status:"ok", popularPurchases:purchaseData});
                });
            });
        }
    });
};

var fetchUserPurchases = function(username, callback){
    var path = "purchases/by_user/";
    var purchaseData = [];
    var productData = [];

    request(
        {method:'GET', uri: curl + path + username + "?limit=" + NUMBER_OF_PURCHASES},
        function (err, response, body) {
            purchaseWorker(JSON.parse(body));
        }
    )

    //Function purchaseWorker does much of the heavy lifting.
    //It uses the async module to perform backend calls simultaneously
    var purchaseWorker = function(userPurchases){
        async.parallel([
            function(callback){//get purchases for each product
                async.each(userPurchases.purchases, function(purchase, callback){
                    var recentBuyers = [];
                    var purchasepath = "purchases/by_product/";
                    var productid = purchase.productId;

                    request(
                        {method:'GET', uri: curl + purchasepath + productid},
                        function (err, response, body) {
                            var purchaseBodyJSON = JSON.parse(body);
                            for(var i = 0; i < purchaseBodyJSON.purchases.length; i++){
                                recentBuyers.push(purchaseBodyJSON.purchases[i].username);
                            }
                            purchaseData.push({id:productid, recent:recentBuyers});
                            callback();
                        }
                    )
                },
                function(){
                    callback();
                });
            },
            function(callback){//get info for each product
                async.each(userPurchases.purchases, function(purchase, callback){
                        var productpath = "products/";
                        var productid = purchase.productId;

                        request(
                            {method:'GET', uri: curl + productpath + productid},
                            function (err, response, body) {
                                var productBodyJSON = JSON.parse(body);
                                productData.push(productBodyJSON.product);
                                callback();
                            }
                        )
                    },
                    function(){
                        callback();
                    });
            }
        ],function(){
            //Assimilate and sort data
            for(var i = 0; i < productData.length; i++){//cycle through array, add recent purchasers
                var filteredPurchases = purchaseData.filter(function(term){
                    return (term.id == productData[i].id);
                });
                if(filteredPurchases.length > 0){
                    productData[i].recent = filteredPurchases[0].recent;
                }
            }

            var sortedData = productData.sort(function(a,b){
                return b.recent.length - a.recent.length
            });

            cacheData(username, sortedData);
            callback(sortedData);
        });
    };
};

//  *** This is the first line of code executed. Upon performing a GET request to the specified path, getRecentPurchases is called
router.get('/api/recent_purchases', getRecentPurchases);

module.exports = router;
