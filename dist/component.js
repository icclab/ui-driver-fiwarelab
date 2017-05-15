/*
The MIT License

Original JSTACK Library
Copyright (c) 2012 Universidad Politecnica de Madrid

Modifications to support FIWARE Lab Rancher integration
Copyright (C) 2017 Zurich University of Applied Sciences

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
*/

// JSTACK Communication Module
// ---------------------------

// This module provides functions to send GET, POST, PUT and DELETE HTTP requests
// to OpenStack components. It is compatible with the token-based authentication
// proposed by Keystone.

var JSTACK = JSTACK || {};

JSTACK.Comm = (function (JS, undefined) {
    "use strict";

    var send, get, head, post, put, patch, del, getEndpoint, checkToken;

    // Private functions
    // -----------------

    // Function `_send` is internally used to make detailed low-level requests
    // to components.
    send = function (method, url, data, token, callBackOK, callbackError, headers, skip_token) {
        var xhr, body, result;

        callbackError = callbackError || function(resp) {
            //console.log("Error: ", resp);
        };
        callBackOK = callBackOK || function(resp, headers) {
            //console.log("OK: ", resp, headers);
        };

        // This function receives a `method` that can be "GET", "POST", "PUT", or
        // "DELETE". It also receives the `url` to which it has to send the request,
        // the `data` to be sent, that has to be a JSON object, the ´token´ to
        // authenticate the request, and success and error callbacks.
        xhr = new XMLHttpRequest();
        xhr.open(method, url, true);

        if (token !== undefined) {
            xhr.setRequestHeader('X-Auth-Token', token);
        }
        var hasContent = false;
        var hasAccept = false;
        if (headers) {
            for (var head in headers) {
                if (head === "Content-Type") hasContent = true;
                if (head === "Accept") hasAccept = true;
                xhr.setRequestHeader(head, headers[head]);
                //console.log("Header set: ", head, " - ", headers[head]);
            }
        }
        if (data && !hasContent) {
            xhr.setRequestHeader("Content-Type", "application/json");
        }

        if (!hasAccept) {
            xhr.setRequestHeader("Accept", "application/json");
        }

        xhr.onerror = function(error) {
            callbackError({message:"Error", body:error});
        }
        xhr.onreadystatechange = function () {

            // This resolves an error with Zombie.js
            if (flag) {
                return;
            }

            if (xhr.readyState === 4) {
                flag = true;
                switch (xhr.status) {
                // In case of successful response it calls the `callbackOK` function.
                case 100:
                case 200:
                case 201:
                case 202:
                case 203:
                case 204:
                case 205:
                case 206:
                case 207:
                    result = undefined;
                    if (xhr.responseText !== undefined && xhr.responseText !== '') {
                        if (xhr.getResponseHeader('content-type') === 'text/plain; charset=utf-8') {
                            result = xhr.responseText;
                        } else {
                            result = JSON.parse(xhr.responseText);
                        }
                    }
                    callBackOK(result, xhr.getAllResponseHeaders(), xhr.getResponseHeader('x-subject-token'));
                    break;

                // In case of error it sends an error message to `callbackError`.
                case 401:
                    if (skip_token) {
                        callbackError({message:xhr.status + " Error", body:xhr.responseText});
                    } else {
                        checkToken(function () {
                            callbackError({message:xhr.status + " Error", body:xhr.responseText});
                        });
                    }
                default:
                    callbackError({message:xhr.status + " Error", body:xhr.responseText});
                }
            }
        };
        var flag = false;
        if (data !== undefined) {
            body = JSON.stringify(data);
            try {
                xhr.send(body);
            } catch (e) {
                //callbackError(e.message);
                return;
            }
        } else {
            try {
                xhr.send();
            } catch (e) {
                //callbackError(e.message);
                return;
            }
        }
    };

    // Public functions
    // ----------------

    // * Function *get* receives the `url`, the authentication token
    // (which is optional), and callbacks. It sends a HTTP GET request,
    // so it does not send any data.
    get = function (url, token, callbackOK, callbackError, headers, skip_token) {
        send("get", url, undefined, token, callbackOK, callbackError, headers, skip_token);
    };
    // * Function *head* receives the `url`, the authentication token
    // (which is optional), and callbacks. It sends a HTTP HEAD request,
    // so it does not send any data.
    head = function (url, token, callbackOK, callbackError, headers) {
        send("head", url, undefined, token, callbackOK, callbackError);
    };
    // * Function *post* receives the `url`, the authentication token
    // (which is optional), the data to be sent (a JSON Object), and
    // callbacks. It sends a HTTP POST request.
    post = function (url, data, token, callbackOK, callbackError, headers) {
        send("POST", url, data, token, callbackOK, callbackError);
    };
    // * Function *put* receives the same parameters as post. It sends
    // a HTTP PUT request.
    put = function (url, data, token, callbackOK, callbackError, headers) {
        send("PUT", url, data, token, callbackOK, callbackError, headers);
    };
    // * Function *patch* receives the same parameters as post. It sends
    // a HTTP PATC request.
    patch = function (url, data, token, callbackOK, callbackError, headers) {
        headers["Content-Type"] = 'application/openstack-images-v2.1-json-patch';
        send("PATCH", url, data, token, callbackOK, callbackError, headers);
    };
    // * Function *del* receives the same paramaters as get. It sends a
    // HTTP DELETE request.
    del = function (url, token, callbackOK, callbackError, headers) {
        send("DELETE", url, undefined, token, callbackOK, callbackError);
    };

    checkToken = function (callback) {
        console.log('Unauthorize response. Checking token with Keystone ...');
        JSTACK.Keystone.validatetoken(function(r) {
            console.log('Valid token. Perhaps there is a issue in the service authentication');
            callback();
        }, function (e){
            console.log('Invalid Token. Logging out... ', e);
        });
    };

    getEndpoint = function (serv, region, type) {
        var endpoint;
        if (JSTACK.Keystone.params.version === 3) {
            type = type.split('URL')[0];
            for (var e in serv.endpoints) {
                if (serv.endpoints[e].region === region && serv.endpoints[e].interface === type) {
                    endpoint = serv.endpoints[e].url;
                    break;
                }
            }
        } else {
            for (var e in serv.endpoints) {
                if (serv.endpoints[e].region === region) {
                    endpoint = serv.endpoints[e][type];
                    break;
                }
            }
        }

        //if (!endpoint) endpoint = serv.endpoints[0][type];
        return endpoint;
    };

    // Public Functions and Variables
    // ------------------------------
    // This is the list of available public functions and variables
    return {

        // Functions:
        get : get,
        head : head,
        post : post,
        put : put,
        patch: patch,
        del : del,
        getEndpoint: getEndpoint
    };
}(JSTACK));
;
/*
The MIT License

Original JSTACK Library
Copyright (c) 2012 Universidad Politecnica de Madrid

Modifications to support FIWARE Lab Rancher integration
Copyright (C) 2017 Zurich University of Applied Sciences

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
*/

// Keystone API Module
// -------------------

// This file provides functions to access Keystone API's operations,
// such as authenticate and  gettenants.

var JSTACK = JSTACK || {};

JSTACK.Keystone = (function (JS, undefined) {

    "use strict";

    var params, STATES, init, authenticate, gettenants, getendpoint, getservicelist, getservice, createuser, edituser, getusers, getusersfortenant, getuser, deleteuser, getroles, getuserroles, adduserrole, removeuserrole, createtenant, edittenant, deletetenant, validatetoken;

    // `STATES` defines different authentication states. This
    // can be useful for applications to know when they can
    // access to authentication tokens.

    STATES = {
        DISCONNECTED : 0,
        AUTHENTICATING : 1,
        AUTHENTICATED : 2,
        AUTHENTICATION_ERROR : 3
    };

    // `params` stores info about Keystone service:
    params = {
        // * **url** points to Keystone location. Typically it could be http://host:5000/
        url : undefined,
        // * **currentstate** stores the state of this API based on options given by `STATES`
        currentstate : undefined,
        // * **access** stores the last information retreived during last successful authentication
        access : undefined,
        // * **token** gives the authentication info obtained during last successful authentication
        token : undefined
    };

    // We need to initialize this API by passing the Keystone's URL. This URL usually follows the next
    // pattern: http://host:5000/
    // This API will initialize parameters such as `currentstate`, `token` and `access`.
    init = function (keystoneUrl, adminUrl) {
        console.log("Admin URL" + adminUrl);
        params.url = keystoneUrl;
        params.adminUrl = adminUrl;
        params.access = undefined;
        params.token = undefined;
        params.access_token = undefined;
        params.currentstate = STATES.DISCONNECTED;
        params.version = keystoneUrl.indexOf('v3') === -1 ? 2 : 3;
    };
    // Authentication function
    // ------------------------
    // This API offers Keystone authentication.
    authenticate = function (username, password, token, tenant, callback, error) {
        var credentials = {}, onOK, onError;
        // This authentication needs a `username`, a `password`. Or a `token`.
        if (params.version === 3) {

            if (token !== undefined) {
                credentials = {
                    "auth": {
                        "identity": {
                            "methods": [
                                "oauth2"
                            ],
                            "oauth2": {
                                "access_token_id": token
                            }
                        }
                    }
                }
            } else {
                credentials = {
                    "auth": {
                        "identity": {
                            "methods": [
                                "password"
                            ],
                            "password": {
                                "user": {
                                    "name": username,
                                    "domain": { "id": "default" },
                                    "password": password
                                }
                            }
                        }
                    }
                };
            }

            // User also can provide a `tenant`.
            if (tenant !== undefined) {
                credentials.auth.scope = { project: {id: tenant}};
            }

        } else {

            if (token !== undefined) {
                credentials = {
                    "auth" : {
                        "token" : {
                            "id" : token
                        }
                    }
                };
            } else { 
                credentials = {
                    "auth" : {
                        "passwordCredentials" : {
                            "username" : username,
                            "password" : password
                        }
                    }
                };
            }

            // User also can provide a `tenant`.
            if (tenant !== undefined) {
                credentials.auth.tenantId = tenant;
            }
        }

        // During authentication the state will be `AUTHENTICATION`.
        params.currentstate = STATES.AUTHENTICATING;

        // Once Keystone server sends a response to this API client it will call the function
        // `callback` with the result, if provided. It also updates the state to `AUTHENTICATED`
        // and stores result in `access`.
        onOK = function (result) {
            params.currentstate = JS.Keystone.STATES.AUTHENTICATED;
            params.access = result.access;
            params.token = params.access.token.id;
            if (callback !== undefined) {
                callback(result);
            }
        };

        // In case of an error the state will be `AUTHENTICATION_ERROR` and it throws the corresponding
        // error with its description.
        onError = function (message) {
            params.currentstate = STATES.AUTHENTICATION_ERROR;
            if (error !== undefined) {
                error(params.currentstate);
            }
 
        };

        // A typical response would be:
        //
        //     {
        //        "token": {
        //            "expires": "2012-03-10T15:41:58.905480",
        //            "id": "d1eb612e-24fa-48b3-93d4-fc6c90379078",
        //            "tenant": {
        //                "id": "2",
        //                "name": "demo"
        //            }
        //        },
        //        "serviceCatalog": [
        //              {
        //                "endpoints": [
        //                    {
        //                        "adminURL": "http://host.name:8774/v1.1/2",
        //                        "region": "nova",
        //                        "internalURL": "http://host.name:8774/v1.1/2",
        //                        "publicURL": "http://host.name:80/v1.1/2"
        //                    }
        //                ],
        //                "type": "compute",
        //                "name": "nova"
        //            },
        //        ],
        //        "user": {
        //            "id": "1",
        //            "roles": [
        //                {
        //                    "tenantId": "2",
        //                    "id": "1",
        //                    "name": "Admin"
        //                },
        //                {
        //                    "id": "1",
        //                    "name": "Admin"
        //                },
        //            ],
        //            "name": "admin"
        //        }
        //       }
        if (params.version === 3) {
            JS.Comm.post(params.url + "auth/tokens", credentials, undefined, function (result, headers, token) {
                var resp = {
                    access:{
                        token: {
                            id: token, 
                            expires: result.token.expires_at, 
                            tenant: {
                                id: result.token.project.id,
                                name: result.token.project.name
                            }
                        }, 
                        serviceCatalog: result.token.catalog,
                        user: result.token.user
                    }
                };

                onOK(resp);

            }, onError);
        } else {
            JS.Comm.post(params.url + "tokens", credentials, undefined, onOK, onError);
        }
    };

    validatetoken = function (callback, error) {
        var onOK, onError;
    
        onOK = function (result) {
            if (callback !== undefined) {
                callback(result);
            }
        };

        onError = function (result) {
            // If error occurs it will send its description.
            if (error !== undefined) {
                error(result);
            }
        };

        var url = params.url;

        if (params.version === 3) {
            JS.Comm.get(url + "auth/tokens", params.token, onOK, onError, {}, true);
        } else {
            JS.Comm.get(url + "tokens/" + params.token, params.token, onOK, onError, {}, true);
        }
    };

    // Retreiving service information
    // ------------------------------
    // The user can also obtain information about each service which is configured in Keystone.
    getservice = function (name) {
        var index, service;

        // Only if the client is currently authenticated.
        if (params.currentstate !== STATES.AUTHENTICATED) {
            return undefined;
        }

        for (index in params.access.serviceCatalog) {
            if (params.access.serviceCatalog[index] !== undefined) {
                service = params.access.serviceCatalog[index];
                if (name === service.type) {
                    // This function will return an object with the next structure:
                    //
                    //     service: {
                    //          endpoints: [
                    //               {
                    //               adminURL: "http://host.name:8774/v1.1/2",
                    //               internalURL: "http://host.name:8774/v1.1/2",
                    //               publicURL: "http://host.name:80/v1.1/2",
                    //               region: "nova"
                    //               },
                    //               name: "nova",
                    //               type: "compute"
                    //          ]
                    //     }
                    //
                    return service;
                }
            }
        }
        return undefined;
    };

    // Retreiving endpoint information
    // ------------------------------
    // The user can also obtain information about each service which is configured in Keystone.
    getendpoint = function (region, type) {
        var serv = getservice(type) || {};
        var endpoint;
        for (var e in serv.endpoints) {
            if (serv.endpoints[e].region === region) {
                endpoint = serv.endpoints[e];
                break;
            }
        }
        return endpoint;
    };

    // The user can also obtain information about all services configured in Keystone.
    getservicelist = function () {
        // Only if the client is currently authenticated.
        if (params.currentstate !== STATES.AUTHENTICATED) {
            return undefined;
        }
        return params.access.serviceCatalog;
    };

    // Tenant information function
    // ---------------------------
    // User can obtain information about available tenants.
    gettenants = function (callback, admin, error) {
        var onOK, onError;

        // Only when the user is already authenticated.
        //if (params.currentstate === JS.Keystone.STATES.AUTHENTICATED) {
            // This function will return tenant information following next pattern:
            //
            //         tenants: {
            //                links: [
            //                        {       href: "http://host.name:5000/tenants",
            //                                rel: "prev"
            //                        }
            //                ],
            //                values: [
            //                        {
            //                                description: "test",
            //                                enabled: true,
            //                                id: "3",
            //                                name: "test"
            //                        },
            //                        {
            //                                description: "None",
            //                                enabled: true,
            //                                id: "2",
            //                                name: "demo"
            //                        },
            //                        {
            //                                description: "None",
            //                                enabled: true,
            //                                id: "1",
            //                                name: "admin"
            //                        }
            //                ]
            //         }
            //
            onOK = function (result) {
                if (callback !== undefined) {
                    callback(result);
                }
            };

            onError = function (result) {
                // If error occurs it will send its description.
                if (error !== undefined) {
                    error(result);
                }
            };

            var url = params.url;
            if (admin) {
                url = params.adminUrl
            }

            if (params.version === 3 && params.access_token) {
                JS.Comm.get(url + "authorized_organizations/" + params.access_token, undefined, function (result) {
                    onOK({tenants: result.organizations});
                }, onError);
            } else {
                JS.Comm.get(url + "tenants", params.token, onOK, onError);
            }

        //}
    };


    createuser = function(username, password, tenant_id, email, enabled, onOk, onError) {
        if (params.currentstate === JS.Keystone.STATES.AUTHENTICATED) {
           var data = {"user": {"name": username,
                               "password": password,
                               "tenantId": tenant_id,
                               "email": email,
                               "enabled": enabled}};
           JS.Comm.post(params.adminUrl + "users", data, params.token, onOk, onError);
        }
    };

    edituser = function(id, username, password, tenant_id, email, enabled, onOk, onError) {
        if (params.currentstate === JS.Keystone.STATES.AUTHENTICATED) {
           var data = {"user": {"name": username,
                               "tenantId": tenant_id,
                               "email": email,
                               "enabled": enabled}};

            if (password !== undefined) {
                data.user.password = password;
            }
           JS.Comm.put(params.adminUrl + "users/" + id, data, params.token, onOk, onError);
        }
    };

    getusers = function(onOk, onError) {
        if (params.currentstate === JS.Keystone.STATES.AUTHENTICATED) {
            JS.Comm.get(params.adminUrl + "users", params.token, onOk, onError);
        }
    };

    getusersfortenant = function(tenant_id, onOk, onError) {
        if (params.currentstate === JS.Keystone.STATES.AUTHENTICATED) {
            JS.Comm.get(params.adminUrl + "tenants/" + tenant_id + "/users", params.token, onOk, onError);
        }
    };

    getuser = function(user_id, onOk, onError) {
        if (params.currentstate === JS.Keystone.STATES.AUTHENTICATED) {
            JS.Comm.get(params.adminUrl + "users/" + user_id, params.token, onOk, onError);
        }
    };

    getroles = function(onOk, onError) {
        if (params.currentstate === JS.Keystone.STATES.AUTHENTICATED) {
            JS.Comm.get(params.adminUrl + "OS-KSADM/roles", params.token, onOk, onError);
        }
    };

    deleteuser = function(user_id, onOk, onError) {
        if (params.currentstate === JS.Keystone.STATES.AUTHENTICATED) {
            JS.Comm.del(params.adminUrl + "users/" + user_id, params.token, onOk, onError);
        }
    };

    getuserroles = function(user_id, tenant_id, onOk, onError) {
        if (params.currentstate === JS.Keystone.STATES.AUTHENTICATED) {
            var route = "";
            if (tenant_id !== undefined) {
                route = params.adminUrl + "tenants/" + tenant_id + "/users/" + user_id + "/roles";
            } else {
                route = params.adminUrl + "users/" + user_id + "/roles";
            }
            JS.Comm.get(route, params.token, onOk, onError);
        }
    };

    adduserrole = function(user_id, role_id, tenant_id, onOk, onError) {
        if (params.currentstate === JS.Keystone.STATES.AUTHENTICATED) {
            var route = "";
            if (tenant_id !== undefined) {
                route = params.adminUrl + "tenants/" + tenant_id + "/users/" + user_id + "/roles/OS-KSADM/" + role_id;
            } else {
                route = params.adminUrl + "users/" + user_id + "/roles/OS-KSADM/" + role_id;
            }
            JS.Comm.put(route, {}, params.token, onOk, onError);
        }
    };

    removeuserrole = function(user_id, role_id, tenant_id, onOk, onError) {
        if (params.currentstate === JS.Keystone.STATES.AUTHENTICATED) {
            var route = "";
            if (tenant_id !== undefined) {
                route = params.adminUrl + "tenants/" + tenant_id + "/users/" + user_id + "/roles/OS-KSADM/" + role_id;
            } else {
                route = params.adminUrl + "users/" + user_id + "/roles/OS-KSADM/" + role_id;
            }
            JS.Comm.del(route, params.token, onOk, onError);
        }
    };

    createtenant = function(name, description, enabled, onOk, onError) {
        if (params.currentstate === JS.Keystone.STATES.AUTHENTICATED) {
           var data = {"tenant": {"name": name,
                             "description": description,
                             "enabled": enabled}};
           JS.Comm.post(params.adminUrl + "tenants", data, params.token, onOk, onError);
        }
    };

    edittenant = function(id, name, description, enabled, onOk, onError) {
        if (params.currentstate === JS.Keystone.STATES.AUTHENTICATED) {
           var data = {"tenant": {"id": id,
                            "name": name,
                            "description": description,
                            "enabled": enabled}};
           JS.Comm.put(params.adminUrl + "tenants/" + id, data, params.token, onOk, onError);
        }
    };

    deletetenant = function(tenant_id, onOk, onError) {
        if (params.currentstate === JS.Keystone.STATES.AUTHENTICATED) {
           JS.Comm.del(params.adminUrl + "tenants/" + tenant_id, params.token, onOk, onError);
        }
    };

    // Public Functions and Variables
    // ---------------------------
    // This is the list of available public functions and variables
    return {
        // Variables:
        STATES : STATES,
        params : params,
        // Functions:
        init : init,
        authenticate : authenticate,
        validatetoken : validatetoken,
        gettenants : gettenants,
        getendpoint: getendpoint,
        getservice : getservice,
        getservicelist : getservicelist,
        createuser : createuser,
        edituser : edituser,
        getusers : getusers,
        getusersfortenant : getusersfortenant,
        getuser : getuser,
        deleteuser : deleteuser,
        getuserroles : getuserroles,
        getroles : getroles,
        adduserrole : adduserrole,
        removeuserrole : removeuserrole,
        createtenant : createtenant,
        edittenant: edittenant,
        deletetenant : deletetenant
    };
}(JSTACK));
;
/*
The MIT License

Original JSTACK Library
Copyright (c) 2012 Universidad Politecnica de Madrid

Modifications to support FIWARE Lab Rancher integration
Copyright (C) 2017 Zurich University of Applied Sciences

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
*/

/// JStack Neutron Module
// ------------------

var JSTACK = JSTACK || {};

JSTACK.Neutron = (function(JS, undefined) {
    "use strict";
    var params, check, configure, getnetworkslist, createnetwork, updatenetwork, getnetworkdetail, deletenetwork,
    getsubnetslist, createsubnet, updatesubnet, getsubnetdetail, deletesubnet,
    getportslist, createport, updateport, getportdetail, deleteport, getrouterslist, createrouter, updaterouter,
    getrouterdetail, deleterouter, addinterfacetorouter, removeinterfacefromrouter;

    // This modules stores the `url`to which it will send every
    // request. 
    params = {
        url: undefined,
        baseurl: undefined,
        state: undefined,
        endpointType: "publicURL"
    };

    // Private functions
    // -----------------

    // Function `check` internally confirms that Keystone module is
    // authenticated and it has the URL of the Glance service.
    check = function(region) {
        if (JS.Keystone !== undefined && JS.Keystone.params.currentstate === JS.Keystone.STATES.AUTHENTICATED) {
            var service = JS.Keystone.getservice("network");
            if (service) {
                params.url = params.baseurl + JSTACK.Comm.getEndpoint(service, region, params.endpointType);
                return true;
            }
            return false;
        }
        return false;
    };
    // Public functions
    // ----------------
    //

    // This function sets the endpoint type for making requests to Glance.
    // It could take one of the following values:
    // * "adminURL"
    // * "internalURL"
    // * "publicURL"
    // You can use this function to change the default endpointURL, which is publicURL.
    configure = function(endpointType) {
        if (endpointType === "adminURL" || endpointType === "internalURL" || endpointType === "publicURL") {
            params.endpointType = endpointType;
        }
    };

    getnetworkslist = function(callback, error, region) {
        var url, onOK, onError;
        if (!check(region)) {
            return;
        }

        url = params.url + 'v2.0/networks';

        onOK = function(result) {
            if (callback !== undefined) {
                callback(result.networks);
            }
        };
        onError = function(message) {
            if (error !== undefined) {
                error(message);
            }
        };

        JS.Comm.get(url, JS.Keystone.params.token, onOK, onError);
    };

    createnetwork = function(name, admin_state_up, shared, tenant_id, callback, error, region) {
        var url, onOK, onError, data;
        if (!check(region)) {
            return;
        }
        url = params.url + 'v2.0/networks';

        data = {
            "network" : {
            }
        };

        if (name !== undefined) {
            data.network.name = name;
        }

        if (admin_state_up !== undefined) {
            data.network.admin_state_up = admin_state_up;
        }

        if (shared !== undefined) {
            data.network.shared = shared;
        }

        if (tenant_id !== undefined) {
            data.network.tenant_id = tenant_id;
        }

        onOK = function(result) {
            if (callback !== undefined) {
                callback(result);
            }
        };
        onError = function(message) {
            if (error !== undefined) {
                error(message);
            }
        };

        JS.Comm.post(url, data, JS.Keystone.params.token, onOK, onError);
    };

    getnetworkdetail = function(network_id, callback, error, region) {
        var url, onOK, onError;
        if (!check(region)) {
            return;
        }
        url = params.url + 'v2.0/networks/' + network_id;

        onOK = function(result) {
            if (callback !== undefined) {
                callback(result.network);
            }
        };
        onError = function(message) {
            if (error !== undefined) {
                error(message);
            }
        };

        JS.Comm.get(url, JS.Keystone.params.token, onOK, onError);
    };

    updatenetwork = function(network_id, name, admin_state_up, callback, error, region) {
        var url, onOK, onError, data;
        if (!check(region)) {
            return;
        }
        
        url = params.url + 'v2.0/networks/' + network_id;

        data = {
            "network" : {
            }
        };

        if (name !== undefined) {
            data.network.name = name;
        }

        if (admin_state_up !== undefined) {
            data.network.admin_state_up = admin_state_up;
        }

        onOK = function(result) {
            if (callback !== undefined) {
                callback(result);
            }
        };
        onError = function(message) {
            if (error !== undefined) {
                error(message);
            }
        };

        JS.Comm.put(url, data, JS.Keystone.params.token, onOK, onError);
    };

    deletenetwork = function(network_id, callback, error, region) {
        var url, onOK, onError;
        if (!check(region)) {
            return;
        }
        url = params.url + 'v2.0/networks/' + network_id;

        onOK = function(result) {
            if (callback !== undefined) {
                callback(result);
            }
        };
        onError = function(message) {
            if (error !== undefined) {
                error(message);
            }
        };

        JS.Comm.del(url, JS.Keystone.params.token, onOK, onError);
    };

    getsubnetslist = function(callback, error, region) {
        var url, onOK, onError;
        if (!check(region)) {
            return;
        }
        
        url = params.url + 'v2.0/subnets';

        onOK = function(result) {
            if (callback !== undefined) {
                callback(result);
            }
        };
        onError = function(message) {
            if (error !== undefined) {
                error(message);
            }
        };

        JS.Comm.get(url, JS.Keystone.params.token, onOK, onError);
    };

    createsubnet = function(network_id, cidr, name, allocation_pools, tenant_id, gateway_ip, ip_version, enable_dhcp, dns_nameservers, host_routes, callback, error, region) {
        var url, onOK, onError, data;
        if (!check(region)) {
            return;
        }        
        url = params.url + 'v2.0/subnets';

        data = {
            "subnet" : {
                "network_id" : network_id,
                "cidr" : cidr,
                "ip_version" : ip_version
            }
        }

        if (name !== undefined) {
            data.subnet.name = name;
        }

        if (tenant_id !== undefined) {
            data.subnet.tenant_id = tenant_id;
        }

        if (allocation_pools !== undefined) {
            data.subnet.allocation_pools = allocation_pools;
        }

        if (gateway_ip !== undefined) {
            data.subnet.gateway_ip = gateway_ip;
        }

        if (enable_dhcp !== undefined) {
            data.subnet.enable_dhcp = enable_dhcp;
        }

        if (dns_nameservers !== undefined) {
            data.subnet.dns_nameservers = dns_nameservers;
        }

        if (host_routes !== undefined) {
            data.subnet.host_routes = host_routes;
        }

        onOK = function(result) {
            if (callback !== undefined) {
                callback(result);
            }
        };
        onError = function(message) {
            if (error !== undefined) {
                error(message);
            }
        };

        JS.Comm.post(url, data, JS.Keystone.params.token, onOK, onError);
    };

    getsubnetdetail = function(subnet_id, callback, error, region) {
        var url, onOK, onError;
        if (!check(region)) {
            return;
        }

        url = params.url + 'v2.0/subnets/' + subnet_id;

        onOK = function(result) {
            if (callback !== undefined) {
                callback(result);
            }
        };
        onError = function(message) {
            if (error !== undefined) {
                error(message);
            }
        };

        JS.Comm.get(url, JS.Keystone.params.token, onOK, onError);
    };

    updatesubnet = function(subnet_id, name, gateway_ip, enable_dhcp, dns_nameservers, host_routes, callback, error, region) {
        var url, onOK, onError, data, i, start, end, dns_nameserver, dns_nservers = [], host_route, h_routes = [];
        if (!check(region)) {
            return;
        }
        
        url = params.url + 'v2.0/subnets/' + subnet_id;

        data = {
            "subnet" : {
            }
        }

        if (name !== undefined) {
            data.subnet.name = name;
        }

        if (gateway_ip !== undefined) {
            data.subnet.gateway_ip = gateway_ip;
        }

        if (enable_dhcp !== undefined) {
            data.subnet.enable_dhcp = enable_dhcp;
        }

        if (dns_nameservers !== undefined) {
            for (i in dns_nameservers) {
                if (dns_nameservers[i] !== undefined) {
                    dns_nameserver = dns_nameservers[i];
                    dns_nservers.push(dns_nameserver);
                }
            }
            data.subnet.dns_nameservers = dns_nservers;
        }

        if (host_routes !== undefined) {
            for (i in host_routes) {
                if (host_routes[i] !== undefined) {
                    host_route = host_routes[i];
                    h_routes.push(host_route);
                }
            }
            data.subnet.host_routes = h_routes;
        }

        onOK = function(result) {
            if (callback !== undefined) {
                callback(result);
            }
        };
        onError = function(message) {
            if (error !== undefined) {
                error(message);
            }
        };

        JS.Comm.put(url, data, JS.Keystone.params.token, onOK, onError);
    };

    deletesubnet = function(subnet_id, callback, error, region) {
        var url, onOK, onError;
        if (!check(region)) {
            return;
        }
        
        url = params.url + 'v2.0/subnets/' + subnet_id;

        onOK = function(result) {
            if (callback !== undefined) {
                callback(result);
            }
        };
        onError = function(message) {
            if (error !== undefined) {
                error(message);
            }
        };

        JS.Comm.del(url, JS.Keystone.params.token, onOK, onError);
    };

    getportslist = function(callback, error, region) {
        var url, onOK, onError;
        if (!check(region)) {
            return;
        }
        
        url = params.url + 'v2.0/ports';

        onOK = function(result) {   
            if (callback !== undefined) {
                callback(result);
            }
        };
        onError = function(message) {
            if (error !== undefined) {
                error(message);
            }
        };

        JS.Comm.get(url, JS.Keystone.params.token, onOK, onError);
    };

    createport = function(network_id, name, fixed_ips, security_groups, admin_state_up, status, tenant_id, mac_address, callback, error, region) {
        var url, onOK, onError, data, groups = [], i, group, fixed_ip, fix_ips = [];
        if (!check(region)) {
            return;
        }

        url = params.url + 'v2.0/ports';

        data = {
            "port" : {
                "network_id" : network_id
            }
        };

        if (status !== undefined) {
            data.port.status = status;
        }

        if (name !== undefined) {
            data.port.name = name;
        }

        if (admin_state_up !== undefined) {
            data.port.admin_state_up = admin_state_up;
        }

        if (tenant_id !== undefined) {
            data.port.tenant_id = tenant_id;
        }

        if (mac_address !== undefined) {
            data.port.mac_address = mac_address;
        }

        if (fixed_ips !== undefined) {
            for (i in fixed_ips) {
                if (fixed_ips[i] !== undefined) {
                    fixed_ip = fixed_ips[i];
                    fix_ips.push(fixed_ip);
                }
            }

            data.port.fixed_ips = fix_ips;
        }

        if (security_groups !== undefined) {
            for (i in security_groups) {
                if (security_groups[i] !== undefined) {
                    group = security_groups[i];
                    groups.push(group);
                }
            }

            data.port.security_groups = groups;
        }

        onOK = function(result) {
            if (callback !== undefined) {
                callback(result);
            }
        };
        onError = function(message) {
            if (error !== undefined) {
                error(message);
            }
        };

        JS.Comm.post(url, data, JS.Keystone.params.token, onOK, onError);
    };

    getportdetail = function(port_id, callback, error, region) {
        var url, onOK, onError;
        if (!check(region)) {
            return;
        }

        url = params.url + 'v2.0/ports/' + port_id;

        onOK = function(result) {   
            if (callback !== undefined) {
                callback(result);
            }
        };
        onError = function(message) {
            if (error !== undefined) {
                error(message);
            }
        };

        JS.Comm.get(url, JS.Keystone.params.token, onOK, onError);
    };

    updateport = function(port_id, name, fixed_ips, security_groups, admin_state_up, status, tenant_id, mac_address, callback, error, region) {
        var url, onOK, onError, data, groups = [], i, group, fixed_ip, fix_ips = [];
        if (!check(region)) {
            return;
        }
        
        url = params.url + 'v2.0/ports/' + port_id;

        data = {
            "port" : {
            }
        };

        if (status !== undefined) {
            data.port.status = status;
        }   

        if (name !== undefined) {
            data.port.name = name;
        }

        if (admin_state_up !== undefined) {
            data.port.admin_state_up = admin_state_up;
        }

        if (tenant_id !== undefined) {
            data.port.tenant_id = tenant_id;
        }

        if (mac_address !== undefined) {
            data.port.mac_address = mac_address;
        }

        if (fixed_ips !== undefined) {
            for (i in fixed_ips) {
                if (fixed_ips[i] !== undefined) {
                    fixed_ip = fixed_ips[i];
                    fix_ips.push(fixed_ip);
                }
            }

            data.port.fixed_ips = fix_ips;
        }

        if (security_groups !== undefined) {
            for (i in security_groups) {
                if (security_groups[i] !== undefined) {
                    group = security_groups[i];
                    groups.push(group);
                }
            }

            data.port.security_groups = groups;
        }

        onOK = function(result) {
            if (callback !== undefined) {
                callback(result);
            }
        };
        onError = function(message) {
            if (error !== undefined) {
                error(message);
            }
        };

        JS.Comm.put(url, data, JS.Keystone.params.token, onOK, onError);
    };

    deleteport = function(port_id, callback, error, region) {
        var url, onOK, onError;
        if (!check(region)) {
            return;
        }

        url = params.url + 'v2.0/ports/' + port_id;

        onOK = function(result) {
            if (callback !== undefined) {
                callback(result);
            }
        };
        onError = function(message) {
            if (error !== undefined) {
                error(message);
            }
        };

        JS.Comm.del(url, JS.Keystone.params.token, onOK, onError);
    };

    getrouterslist = function(callback, error, region) {
        var url, onOK, onError;
        if (!check(region)) {
            return;
        }

        url = params.url + 'v2.0/routers';

        onOK = function(result) {
            if (callback !== undefined) {
                callback(result);
            }
        };
        onError = function(message) {
            if (error !== undefined) {
                error(message);
            }
        };

        JS.Comm.get(url, JS.Keystone.params.token, onOK, onError);
    };

    createrouter = function(name, admin_state_up, network_id, tenant_id, callback, error, region) {
        var url, onOK, onError, data;
        if (!check(region)) {
            return;
        }
        url = params.url + 'v2.0/routers';

        data = {
            "router" : {
                "external_gateway_info" : {
                }
            }
        };

        if (network_id !== undefined) {
            data.router.external_gateway_info.network_id = network_id;
        }

        if (name !== undefined) {
            data.router.name = name;
        }

        if (admin_state_up !== undefined) {
            data.router.admin_state_up = admin_state_up;
        }

        if (tenant_id !== undefined) {
            data.router.tenant_id = tenant_id;
        }

        onOK = function(result) {
            if (callback !== undefined) {
                callback(result);
            }
        };
        onError = function(message) {
            if (error !== undefined) {
                error(message);
            }
        };

        JS.Comm.post(url, data, JS.Keystone.params.token, onOK, onError);
    };

    getrouterdetail = function(router_id, callback, error, region) {
        var url, onOK, onError;
        if (!check(region)) {
            return;
        }
        url = params.url + 'v2.0/routers/' + router_id;

        onOK = function(result) {
            if (callback !== undefined) {
                callback(result);
            }
        };
        onError = function(message) {
            if (error !== undefined) {
                error(message);
            }
        };

        JS.Comm.get(url, JS.Keystone.params.token, onOK, onError);
    };

    updaterouter = function(router_id, network_id, name, admin_state_up, callback, error, region) {
        var url, onOK, onError, data;
        if (!check(region)) {
            return;
        }
        
        url = params.url + 'v2.0/routers/' + router_id;

        data = {
            "router" : {
                "external_gateway_info" : {
                }
            }
        };

        if (network_id !== undefined) {
            data.router.external_gateway_info.network_id = network_id;
        }

        if (name !== undefined) {
            data.router.name = name;
        }

        if (admin_state_up !== undefined) {
            data.router.admin_state_up = admin_state_up;
        }

        onOK = function(result) {
            if (callback !== undefined) {
                callback(result);
            }
        };
        onError = function(message) {
            if (error !== undefined) {
                error(message);
            }
        };

        JS.Comm.put(url, data, JS.Keystone.params.token, onOK, onError);
    };

    deleterouter = function(router_id, callback, error, region) {
        var url, onOK, onError;
        if (!check(region)) {
            return;
        }
        url = params.url + 'v2.0/routers/' + router_id;

        onOK = function(result) {
            if (callback !== undefined) {
                callback(result);
            }
        };
        onError = function(message) {
            if (error !== undefined) {
                error(message);
            }
        };

        JS.Comm.del(url, JS.Keystone.params.token, onOK, onError);
    };

    addinterfacetorouter = function(router_id, subnet_id, port_id, callback, error, region) {
        var url, onOK, onError, data;
        if (!check(region)) {
            return;
        }
        url = params.url + 'v2.0/routers/' + router_id + '/add_router_interface';

        data = {
         
        };

        if (subnet_id !== undefined) {
            data.subnet_id = subnet_id;
        }

        if (port_id !== undefined) {
            data.port_id = port_id;
        }

        onOK = function(result) {
            if (callback !== undefined) {
                callback(result);
            }
        };
        onError = function(message) {
            if (error !== undefined) {
                error(message);
            }
        };

        JS.Comm.put(url, data, JS.Keystone.params.token, onOK, onError);
    };

    removeinterfacefromrouter = function(router_id, port_id, subnet_id, callback, error, region) {
        var url, onOK, onError, data;
        if (!check(region)) {
            return;
        }

        data = {  
             
        };

        url = params.url + 'v2.0/routers/' + router_id + '/remove_router_interface';

        if (subnet_id !== undefined) {
            data.subnet_id = subnet_id;
        }

        if (port_id !== undefined) {
            data.port_id = port_id;
        }

        onOK = function(result) {
            if (callback !== undefined) {
                callback(result);
            }
        };
        onError = function(message) {
            if (error !== undefined) {
                error(message);
            }
        };

        JS.Comm.put(url, data, JS.Keystone.params.token, onOK, onError);
    };

    // Public Functions and Variables
    // ------------------------------
    // This is the list of available public functions and variables
    return {
        params : params,
        // Functions:
        configure: configure,
        getnetworkslist : getnetworkslist,
        getnetworkdetail : getnetworkdetail,
        createnetwork : createnetwork,
        updatenetwork : updatenetwork,
        deletenetwork : deletenetwork,
        getsubnetslist : getsubnetslist,
        getsubnetdetail : getsubnetdetail,
        createsubnet : createsubnet,
        updatesubnet : updatesubnet,
        deletesubnet : deletesubnet,
        getportslist : getportslist,
        getportdetail : getportdetail,
        createport : createport,
        updateport : updateport,
        deleteport : deleteport,
        getrouterslist : getrouterslist,
        createrouter : createrouter,
        updaterouter : updaterouter,
        getrouterdetail :getrouterdetail,
        deleterouter : deleterouter,
        addinterfacetorouter : addinterfacetorouter,
        removeinterfacefromrouter : removeinterfacefromrouter
    };

}(JSTACK));
;
/*
The MIT License

Original JSTACK Library
Copyright (c) 2012 Universidad Politecnica de Madrid

Modifications to support FIWARE Lab Rancher integration
Copyright (C) 2017 Zurich University of Applied Sciences

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
*/

// JStack Nova Module
// ------------------

// This module provides Nova API functions.

var JSTACK = JSTACK || {};

JSTACK.Nova = (function (JS, undefined) {
    "use strict";

    var params, configure, check, postAction, getserverlist, getserverdetail, getserverips,
        updateserver, createserver, deleteserver, changepasswordserver,
        rebootserverhard, rebootserversoft, resizeserver, confirmresizedserver,
        revertresizedserver, startserver, stopserver, pauseserver,
        unpauseserver, suspendserver, resumeserver, createimage, getflavorlist,
        getflavordetail, createflavor, deleteflavor, getimagelist,
        getimagedetail, deleteimage, getkeypairlist, createkeypair,
        deletekeypair, getkeypairdetail, getvncconsole, getconsoleoutput, getattachedvolumes,
        attachvolume, detachvolume, getattachedvolume,getquotalist, updatequota,
        getdefaultquotalist, getsecuritygrouplist, createsecuritygroup, getsecuritygroupdetail,
        deletesecuritygroup, createsecuritygrouprule, deletesecuritygrouprule, getsecuritygroupforserver,
        getfloatingIPpools, getfloatingIPs, getfloatingIPdetail, allocatefloatingIP, associatefloatingIP, 
        disassociatefloatingIP, releasefloatingIP;

    // This modules stores the `url`to which it will send every
    // request.
    params = {
        url : undefined,
        state : undefined,
        baseurl: undefined,
        endpointType : "publicURL",
        service : "compute"
    };

    // Private functions
    // -----------------

    // Function `_check` internally confirms that Keystone module is
    // authenticated and it has the URL of the Nova service.
    check = function (region) {
        if (JS.Keystone !== undefined &&
                JS.Keystone.params.currentstate === JS.Keystone.STATES.AUTHENTICATED) {
            var service = JS.Keystone.getservice(params.service);
            if (service) {
                params.url = params.baseurl + JSTACK.Comm.getEndpoint(service, region, params.endpointType);
                return true;
            }
            return false;            
        }
        return false;
    };
    // This function is used internally to send Actions to server identified
    // with `id`. In `data` we pass the corresponding information about the
    // action.
    postAction = function (id, data, callback, error, region) {
        var url, onOk, onError;

        if (!check(region)) {
            return;
        }

        url = params.url + '/servers/' + id + '/action';

        onOk = function (result) {
            if (callback !== undefined) {
                callback(result);
            }
        };
        onError = function (message) {
            if (error !== undefined) {
                error(message);
            }
        };

        JS.Comm.post(url, data, JS.Keystone.params.token, onOk, onError);
    };
    // Public functions
    // ----------------
    //

    // This function sets the endpoint type for making requests to Glance.
    // It could take one of the following values:
    // * "adminURL"
    // * "internalURL"
    // * "publicURL"
    // You can use this function to change the default endpointURL, which is publicURL.
    configure = function (endpointType) {
        if (endpointType === "adminURL" || endpointType === "internalURL" || endpointType === "publicURL") {
            params.endpointType = endpointType;
        }
    };


    // **Server Operations**

    //
    // This operation provides a list of servers associated with the account. In
    // [Create Server List](http://docs.openstack.org/api/openstack-compute/2/content/List_Servers-d1e2078.html)
    // there is more information about the JSON object that is returned.
    getserverlist = function (detailed, allTenants, callback, error, region) {
        var url, onOK, onError;
        if (!check(region)) {
            return;
        }
        url = params.url + '/servers';
        if (detailed !== undefined && detailed) {
            url += '/detail';
        }

        if (allTenants) {
            url += '?all_tenants=' + allTenants;
        }

        onOK = function (result) {
            if (callback !== undefined) {
                callback(result);
            }
        };
        onError = function (message) {
            if (error !== undefined) {
                error(message);
            }
        };

        JS.Comm.get(url, JS.Keystone.params.token, onOK, onError);
    };
    // This operation returns the details of a specific server by its `id`. In
    // [Get Server Details](http://docs.openstack.org/api/openstack-compute/2/content/Get_Server_Details-d1e2623.html)
    // there is more information about the JSON object that is returned.
    getserverdetail = function (id, callback, error, region) {
        var url, onOK, onError;
        if (!check(region)) {
            return;
        }
        url = params.url + '/servers/' + id;

        onOK = function (result) {
            if (callback !== undefined) {
                callback(result);
            }
        };
        onError = function (message) {
            if (error !== undefined) {
                error(message);
            }
        };

        JS.Comm.get(url, JS.Keystone.params.token, onOK, onError);
    };
    // This operation returns the ip address of a specific server by its `id`.
    // In
    // [List Addresses](http://docs.openstack.org/api/openstack-compute/2/content/List_Addresses-d1e3014.html)
    // and in
    // [List Addresses by Network](http://docs.openstack.org/api/openstack-compute/2/content/List_Addresses_by_Network-d1e3118.html)
    // there is more information about the JSON object that is returned.
    getserverips = function (id, networkID, callback, error, region) {
        var url, onOK, onError;
        if (!check(region)) {
            return;
        }
        url = params.url + '/servers/' + id + '/ips';

        if (networkID !== undefined) {
            url += '/' + networkID;
        }

        onOK = function (result) {
            if (callback !== undefined) {
                callback(result);
            }
        };
        onError = function (message) {
            if (error !== undefined) {
                error(message);
            }
        };

        JS.Comm.get(url, JS.Keystone.params.token, onOK, onError);
    };
    // This operation updates the the `name` of the server given by its `id`. In
    // [Server Update](http://docs.openstack.org/api/openstack-compute/2/content/ServerUpdate.html)
    // there is more information about the JSON object that is returned.
    updateserver = function (id, name, callback, error, region) {
        var url, onOK, onError, data;
        if (!check(region)) {
            return;
        }
        url = params.url + '/servers/' + id;

        if (name === undefined) {
            return;
        }

        data = {
            "server" : {
                "name" : name
            }
        };

        onOK = function (result) {
            if (callback !== undefined) {
                callback(result);
            }
        };
        onError = function (message) {
            if (error !== undefined) {
                error(message);
            }
        };

        JS.Comm.put(url, data, JS.Keystone.params.token, onOK, onError);
    };
    // This operation asynchronously provisions a new server. The progress of
    // this operation depends on several factors including location of the
    // requested image, network i/o, host load, and the selected flavor. The
    // progress of the request can be checked by performing a `getserverdetail`,
    // which will return a progress attribute (0-100% completion).
    //
    // Arguments in this function are:
    //
    // a. Mandatory
    //
    // * The `name` we want to put to the new server
    //
    // * The `imageRef`, that is the id of the image we will
    // instantiate
    //
    // * The `flavorReg`, that is the id of the flavor we will use
    //
    // b. Optional
    //
    // * The `key_name` that corresponds to the name of the key we will
    // later use to access the instance by SSH (default is None)
    //
    // * Some raw data as `user_data` (default is None)
    //
    // * An array with names of the `security_groups` in which we want to
    // put our instance (default is none)
    //
    // * The minimum number of instances to be started as `min_count` (
    // default is 1)
    //
    // * The maximum number of instances as `max_count` (default is 1)
    //
    // * And the `availability_zone` (default is None)
    //
    // In [Create Servers](http://docs.openstack.org/api/openstack-compute/2/content/CreateServers.html)
    // there is more information about the JSON object that is returned.
    createserver = function (name, imageRef, flavorRef, key_name, user_data, security_groups, min_count, max_count, availability_zone, networks, block_device_mapping, metadata, callback, error, region) {
        var url, onOK, onError, data, groups = [], i, group, nets = [], urlPost;
        if (!check(region)) {
            return;
        }
        
        data = {
            "server" : {
                "name" : name,
                "imageRef" : imageRef,
                "flavorRef" : flavorRef
                //"nics": nics
            }
        };

        if (metadata) {
            data.server.metadata = metadata;
        }

        if (block_device_mapping !== undefined) {
            urlPost = "/os-volumes_boot";      
        } else {
            urlPost = "/servers";
        }

        if (key_name !== undefined) {
            data.server.key_name = key_name;
        }

        if (user_data !== undefined) {
            data.server.user_data = JS.Utils.encode(user_data);
        }

        if (block_device_mapping !== undefined) {
            data.server.block_device_mapping = block_device_mapping;
        }

        if (security_groups !== undefined) {
            for (i in security_groups) {
                if (security_groups[i] !== undefined) {
                    group = {
                        "name" : security_groups[i]
                    };
                    groups.push(group);
                }
            }

            data.server.security_groups = groups;
        }

        if (min_count === undefined) {
            min_count = 1;
        }

        data.server.min_count = min_count;

        if (max_count === undefined) {
            max_count = 1;
        }

        data.server.max_count = max_count;

        if (availability_zone !== undefined) {
            data.server.availability_zone = JS.Utils.encode(availability_zone);
        }

        if (networks !== undefined) {
            data.server.networks = networks;
        }

        onOK = function (result) {
            if (callback !== undefined) {
                callback(result);
            }
        };
        onError = function (message) {
            if (error !== undefined) {
                error(message);
            }
        };

        JS.Comm.post(params.url + urlPost, data, JS.Keystone.params.token, onOK, onError);

    };
    // This operation deletes a cloud server instance from the system.
    // In [Delete Server](http://docs.openstack.org/api/openstack-compute/2/content/Delete_Server-d1e2883.html)
    // there is more information.
    deleteserver = function (id, callback, error, region) {
        var url, onOK, onError;
        if (!check(region)) {
            return;
        }
        url = params.url + '/servers/' + id;

        onOK = function (result) {
            if (callback !== undefined) {
                callback(result);
            }
        };
        onError = function (message) {
            if (error !== undefined) {
                error(message);
            }

        };

        JS.Comm.del(url, JS.Keystone.params.token, onOK, onError);
    };
    // **Server Actions**
    //
    // Take a look at `postAction` for detailed information about requests.

    //
    // This operation changes the server's administrator password.
    // In [Change Password](http://docs.openstack.org/api/openstack-compute/2/content/Change_Password-d1e3234.html)
    // there is more information.
    changepasswordserver = function (id, adminPass, callback, error, region) {
        var data;
        if (adminPass === undefined) {
            return;
        }

        data = {
            "changePassword" : {
                "adminPass" : adminPass
            }
        };

        postAction(id, data, callback , error, region);
    };
    // This operation allows for a hard reboot that is the equivalent of power
    // cycling the server.
    rebootserverhard = function (id, callback, error, region) {
        postAction(id, {
            "reboot" : {
                "type" : "HARD"
            }
        }, callback , error, region);
    };
    // This operation allows for a soft reboot, which allows for a graceful
    // shutdown of all processes.
    // In [Reboot Server](http://docs.openstack.org/api/openstack-compute/2/content/Reboot_Server-d1e3371.html)
    // there is more information about hard and soft reboots.
    rebootserversoft = function (id, callback, error, region) {
        postAction(id, {
            "reboot" : {
                "type" : "SOFT"
            }
        }, callback , error, region);
    };
    // The resize function converts an existing server to a different flavor,
    // in essence, scaling the server up or down. The original server is saved
    // for a period of time to allow rollback if there is a problem. All resizes
    // should be tested and explicitly confirmed with `confirmresizedserver`, at
    // which time the original server is removed. All resizes are automatically
    // confirmed after 24 hours if they are not explicitly confirmed or reverted.
    // In [Resize Server](http://docs.openstack.org/api/openstack-compute/2/content/Resize_Server-d1e3707.html)
    // there is more information.
    resizeserver = function (id, flavorRef, callback, error, region) {
        postAction(id, {
            "resize" : {
                "flavorRef" : flavorRef
            }
        }, callback , error, region);
    };
    // During a resize operation, the original server is saved for a period of
    // time to allow roll back if there is a problem. Once the newly resized
    // server is tested and has been confirmed to be functioning properly, use
    // this operation to confirm the resize. After confirmation, the original
    // server is removed and cannot be rolled back to. All resizes are
    // automatically confirmed after 24 hours if they are not explicitly
    // confirmed or reverted.
    // In [Confirm Resized Server](http://docs.openstack.org/api/openstack-compute/2/content/Confirm_Resized_Server-d1e3868.html)
    // there is more information.
    confirmresizedserver = function (id, callback, error, region) {
        postAction(id, {
            "confirmResize" : null
        }, callback , error, region);
    };
    // In [Revert Resized Server](http://docs.openstack.org/api/openstack-compute/2/content/Revert_Resized_Server-d1e4024.html)
    // there is more information.
    revertresizedserver = function (id, callback, error, region) {
        postAction(id, {
            "revertResize" : null
        }, callback , error, region);
    };
    // It halts a running server. Changes status to STOPPED.
    // In [Start Server](http://api.openstack.org/) there is more information.
    startserver = function (id, callback, error, region) {
        postAction(id, {
            "os-start" : null
        }, callback , error, region);
    };
    // Returns a STOPPED server to ACTIVE status.
    // In [Stop Server](http://api.openstack.org/) there is more information.
    stopserver = function (id, callback, error, region) {
        postAction(id, {
            "os-stop" : null
        }, callback , error, region);
    };
    // It pauses a running server. Changes status to PAUSED.
    pauseserver = function (id, callback, error, region) {
        postAction(id, {
            "pause" : null
        }, callback , error, region);
    };
    // Returns a PAUSED server to ACTIVE status.
    unpauseserver = function (id, callback, error, region) {
        postAction(id, {
            "unpause" : null
        }, callback , error, region);
    };
    // It pauses a running server. Changes status to SUSPENDED.
    suspendserver = function (id, callback, error, region) {
        postAction(id, {
            "suspend" : null
        }, callback , error, region);
    };
    // Returns a SUSPENDED server to ACTIVE status.
    resumeserver = function (id, callback, error, region) {
        postAction(id, {
            "resume" : null
        }, callback , error, region);
    };
    // This action creates a new image for the given server. Once complete, a
    // new image will be available that can be used to rebuild or create servers.
    // In [Create Image](http://docs.openstack.org/api/openstack-compute/2/content/Create_Image-d1e4655.html)
    // there is more information.
    createimage = function (id, name, metadata, callback, error, region) {
        var data = {
            "createImage" : {
                'name' : name
            }
        };

        data.createImage.metadata = {};

        if (metadata !== undefined) {
            data.createImage.metadata = metadata;
        }

        postAction(id, data, callback , error, region);
    };
    // **Flavor Operations**

    // This operation will list all available flavors.
    // In [List Flavors](http://docs.openstack.org/api/openstack-compute/2/content/List_Flavors-d1e4188.html)
    // there is more information.
    getflavorlist = function (detailed, callback, error, region) {
        var url, onOK, onError;
        if (!check(region)) {
            return;
        }
        url = params.url + '/flavors';
        if (detailed !== undefined && detailed) {
            url += '/detail';
        }

        onOK = function (result) {
            if (callback !== undefined) {
                callback(result);
            }
        };
        onError = function (message) {
            if (error !== undefined) {
                error(message);
            }

        };
        JS.Comm.get(url, JS.Keystone.params.token, onOK, onError);
    };
    // This operation returns details of the specified flavor.
    // In [Get Flavor Details](http://docs.openstack.org/api/openstack-compute/2/content/Get_Flavor_Details-d1e4317.html)
    // there is more information.
    getflavordetail = function (id, callback, error, region) {
        var url, onOK, onError;
        if (!check(region)) {
            return;
        }
        url = params.url + '/flavors/' + id;

        onOK = function (result) {
            if (callback !== undefined) {
                callback(result);
            }
        };
        onError = function (message) {
            if (error !== undefined) {
                error(message);
            }
        };
        JS.Comm.get(url, JS.Keystone.params.token, onOK, onError);
    };
    // This operation creates a new flavor, using information given in arguments:
    // the `name` of the new flavor, the number of MB of `ram`, the `id` of the new
    // flavor, the number of GB of root `disk`, the number of GB of `ephemeral` disk,
    // the number of MB of `swap` space, and the `rxtx_factor`.
    // Arguments `ephemeral`, `swap`, `rxtx_factor` and `callback` are optional.
    createflavor = function (name, ram, vcpus, disk, flavorid, ephemeral, swap, rxtx_factor, callback, error, region) {
        var url, onOK, onError, data;
        if (!check(region)) {
            return;
        }
        url = params.url + '/flavors';
        data = {
            "flavor" : {
                "name" : name,
                "ram" : ram,
                "vcpus" : vcpus,
                "disk" : disk,
                "id" : flavorid+"",
                "swap" : 0,
                "OS-FLV-EXT-DATA:ephemeral" : 0,
                "rxtx_factor" : 0
            }
        };

        if (ephemeral !== undefined) {
            data.flavor["OS-FLV-EXT-DATA:ephemeral"] = ephemeral;
        }

        if (swap !== undefined) {
            data.flavor.swap = swap;
        }

        if (rxtx_factor !== undefined) {
            data.flavor.rxtx_factor = rxtx_factor;
        }

        onOK = function (result) {
            if (callback !== undefined) {
                callback(result);
            }
        };
        onError = function (message) {
            if (error !== undefined) {
                error(message);
            }
        };
        JS.Comm.post(url, data, JS.Keystone.params.token, onOK, onError);
    };
    // This operation deletes flavor, specified by its `id`.
    // In [Get Flavor Details](http://docs.openstack.org/api/openstack-compute/2/content/Get_Flavor_Details-d1e4317.html)
    // there is more information.
    deleteflavor = function (id, callback, error, region) {
        var url, onOK, onError;
        if (!check(region)) {
            return;
        }
        url = params.url + '/flavors/' + id;

        onOK = function (result) {
            if (callback !== undefined) {
                callback(result);
            }
        };
        onError = function (message) {
            if (error !== undefined) {
                error(message);
            }
        };

        JS.Comm.del(url, JS.Keystone.params.token, onOK, onError);
    };
    // **Image Operations**

    // This operation will list all images visible by the account.
    // In-flight images will have the status attribute set to SAVING and the
    // conditional progress element (0-100% completion) will also be returned.
    // Other possible values for the status attribute include: UNKNOWN, ACTIVE,
    // SAVING, ERROR, and DELETED. Images with an ACTIVE status are available
    // for install.
    // In [List Images](http://docs.openstack.org/api/openstack-compute/2/content/List_Images-d1e4435.html)
    // there is more information.
    getimagelist = function (detailed, callback, error, region) {
        var url, onOK, onError;
        if (!check(region)) {
            return;
        }
        url = params.url + '/images';
        if (detailed !== undefined && detailed) {
            url += '/detail';
        }
        url += '?limit=100';

        onOK = function (result) {
            if (callback !== undefined) {
                callback(result);
            }
        };
        onError = function (message) {
            if (error !== undefined) {
                error(message);
            }
        };

        JS.Comm.get(url, JS.Keystone.params.token, onOK, onError);
    };
    // This operation returns details of the image specified by its `id`.
    // In [Get Image Details](http://docs.openstack.org/api/openstack-compute/2/content/Get_Image_Details-d1e4848.html)
    // there is more information.
    getimagedetail = function (id, callback, error, region) {
        var url, onOK, onError;
        if (!check(region)) {
            return;
        }
        url = params.url + '/images/' + id;

        onOK = function (result) {
            if (callback !== undefined) {
                callback(result);
            }
        };
        onError = function (message) {
            if (error !== undefined) {
                error(message);
            }
        };
        JS.Comm.get(url, JS.Keystone.params.token, onOK, onError);
    };
    // This operation deletes an image from the system, specified by its `id`.
    // Images are immediately removed. Currently, there are no state transitions
    // to track the delete operation.
    // In [Delete Image](http://docs.openstack.org/api/openstack-compute/2/content/Delete_Image-d1e4957.html)
    // there is more information.
    deleteimage = function (id, callback, error, region) {
        var url, onOK, onError;
        if (!check(region)) {
            return;
        }
        url = params.url + '/images/' + id;

        onOK = function (result) {
            if (callback !== undefined) {
                callback(result);
            }
        };
        onError = function (message) {
            if (error !== undefined) {
                error(message);
            }
        };
        JS.Comm.del(url, JS.Keystone.params.token, onOK, onError);
    };
    // This operation retrieves a list of available Key-pairs.
    getkeypairlist = function (callback, error, region) {
        var url, onOK, onError;
        if (!check(region)) {
            return;
        }
        url = params.url + '/os-keypairs';

        onOK = function (result) {
            if (callback !== undefined) {
                callback(result);
            }
        };
        onError = function (message) {
            if (error !== undefined) {
                error(message);
            }
        };

        JS.Comm.get(url, JS.Keystone.params.token, onOK, onError);
    };
    // This operation creates a new Key-pair.
    createkeypair = function (name, pubkey, callback, error, region) {
        var url, onOK, onError, body;
        if (!check(region)) {
            return;
        }
        url = params.url + '/os-keypairs';

        onOK = function (result) {
            if (callback !== undefined) {
                callback(result.keypair);
            }
        };
        onError = function (message) {
            if (error !== undefined) {
                error(message);
            }
        };
        body = {
            'keypair' : {
                'name' : name
            }
        };

        if (pubkey !== undefined) {
            body.keypair.public_key = pubkey;

        }

        JS.Comm.post(url, body, JS.Keystone.params.token, onOK, onError);
    };
    // This operation deletes a  Key-pair.
    deletekeypair = function (id, callback, error, region) {
        var url, onOK, onError;
        if (!check(region)) {
            return;
        }
        url = params.url + '/os-keypairs/' + id;

        onOK = function (result) {
            if (callback !== undefined) {
                callback(result);
            }
        };
        onError = function (message) {
            if (error !== undefined) {
                error(message);
            }
        };

        JS.Comm.del(url, JS.Keystone.params.token, onOK, onError);
    };
    // This operation shows a Key-pair associated with the account.
    getkeypairdetail = function (keypair_name,callback, error, region) {
        var url, onOK, onError;
        if (!check(region)) {
            return;
        }
        url = params.url + '/os-keypairs/' + keypair_name;

        onOK = function (result) {
            if (callback !== undefined) {
                callback(result);
            }
        };
        onError = function (message) {
            if (error !== undefined) {
                error(message);
            }
        };

        JS.Comm.get(url, JS.Keystone.params.token, onOK, onError);
    };
    // Get a vnc console for an instance
    // id: The server's ID to get the vnc console from.
    // console_type: Type of vnc console to get ('novnc' or 'xvpvnc')
    getvncconsole = function (id, console_type, callback, error, region) {
        var data;
        if (!check(region)) {
            return;
        }

        if (console_type === undefined || !console_type) {
            console_type = "novnc";
        }

        data = {
            "os-getVNCConsole" : {
                'type' : console_type
            }
        };

        postAction(id, data, callback , error, region);
    };
    //  Get text console log output from Server.
    // id: The server's ID to get the vnc console from.
    // length: The number of tail loglines you would like to retrieve.
    getconsoleoutput = function (id, length, callback, error, region) {
        var data;
        if (!check(region)) {
            return;
        }

        if (length === undefined || !length) {
            length = 35;
        }

        data = {
            "os-getConsoleOutput" : {
                'length' : length
            }
        };

        postAction(id, data, callback , error, region);
    };
    //  Lists the volume attachments for the specified server.
    // id: The server's ID to get the volume attachments from.
    getattachedvolumes = function (id, callback, error, region) {
        var url, onOK, onError;
        if (!check(region)) {
            return;
        }
        url = params.url + '/servers/' + id + '/os-volume_attachments';

        onOK = function (result) {
            if (callback !== undefined) {
                callback(result);
            }
        };
        onError = function (message) {
            if (error !== undefined) {
                error(message);
            }
        };

        JS.Comm.get(url, JS.Keystone.params.token, onOK, onError);
    };
    // Attaches a volume to the specified server.
    // id: The server's ID.
    // volume_id: The volume's ID to be attached to the server.
    // device: The device where we want to attach this volume.
    attachvolume = function (id, volume_id, device, callback, error, region) {
        var url, onOK, onError, data;
        if (!check(region)) {
            return;
        }

        url = params.url + '/servers/' + id + '/os-volume_attachments';

        if (volume_id === undefined || device === undefined) {
            return;
        }

        data = {
            'volumeAttachment' : {
                'volumeId' : volume_id,
                'device' : device
            }
        };

        onOK = function (result) {
            if (callback !== undefined) {
                callback(result);
            }
        };
        onError = function (message) {
            if (error !== undefined) {
                error(message);
            }
        };

        JS.Comm.post(url, data, JS.Keystone.params.token, onOK, onError);

    };
    // Deletes the specified volume attachment from the specified server.
    // id: The server's ID.
    // volume_id: The volume's ID to be detached from the server.
    detachvolume = function (id, volume_id, callback, error, region) {
        var url, onOK, onError;
        if (!check(region)) {
            return;
        }

        url = params.url + '/servers/' + id + '/os-volume_attachments/' + volume_id;

        if (volume_id === undefined) {
            return;
        }

        onOK = function (result) {
            if (callback !== undefined) {
                callback(result);
            }
        };
        onError = function (message) {
            if (error !== undefined) {
                error(message);
            }
        };

        JS.Comm.del(url, JS.Keystone.params.token, onOK, onError);

    };
    // Lists volume details for the specified volume attachment ID.
    // id: The server's ID.
    // volume_id: The volume's ID.
    getattachedvolume = function (id, volume_id, callback, error, region) {
        var url, onOK, onError;
        if (!check(region)) {
            return;
        }

        url = params.url + '/servers/' + id + '/os-volume_attachments/' + volume_id;

        if (volume_id === undefined) {
            return;
        }

        onOK = function (result) {
            if (callback !== undefined) {
                callback(result);
            }
        };
        onError = function (message) {
            if (error !== undefined) {
                error(message);
            }
        };

        JS.Comm.get(url, JS.Keystone.params.token, onOK, onError);

    };



    // APIs for quotas//

    // List the quotas for a specific tenant
    // tentnat_id: Id of the tenant for which we check the quota

    getquotalist = function (tenant_id, callback, error, region) {
        var url, onOK, onError;
        if (!check(region)) {
            return;
        }

        url = params.url + '/os-quota-sets/' + tenant_id;

        onOK = function (result) {
            if (callback !== undefined) {
                callback(result);
            }
        };
        onError = function (message) {
            if (error !== undefined) {
                error(message);
            }
        };
        JS.Comm.get(url, JS.Keystone.params.token, onOK, onError);

    };

    // Updates quota with the new values
    // tentnat_id: Id of the tenant for which we update the quota
    // instances, cores, ram, volumes, gigabytes, floating_ips, metadata_items, injected_files,
    // injected_file_content_bytes, injected_file_path_bytes, security_groups, security_group_rules,
    // key_pairs: New parameters for the creating quota
    // example to call API: JSTACK.Nova.updatequota("26b77c04cda6408c972244898f8a3925", 10, 30, 51200, 10, 1000, undefined, 128, 6, 10240, undefined, 10, 20, undefined, printAll);
    
    updatequota = function (
                            tenant_id, 
                            instances, 
                            cores, 
                            ram, 
                            volumes, 
                            gigabytes, 
                            floating_ips,
                            metadata_items, 
                            injected_files, 
                            injected_file_content_bytes, 
                            injected_file_path_bytes,
                            security_groups, 
                            security_group_rules, 
                            key_pairs, 
                            callback, 
                            error, region) {

        var url, data, onOK, onError;
        if (!check(region)) {
            return;
        }

        url = params.url + '/os-quota-sets/' + tenant_id;

        if  ( (instances == undefined)&&(cores == undefined)&&(ram == undefined)&&(volumes == undefined)
            &&(gigabytes == undefined)&&(floating_ips == undefined)&&(metadata_items == undefined)
            &&(injected_files == undefined)&&(injected_file_content_bytes == undefined)
            &&(injected_file_path_bytes == undefined)&&(security_groups == undefined)&&
            (security_group_rules == undefined)&&(key_pairs == undefined) ) {
            return;
        }

        data = {
            'quota_set': {  'instances': instances, 
                            'cores': cores,
                            'ram': ram,
                            'volumes': volumes,
                            'gigabytes': gigabytes, 
                            'floating_ips': floating_ips,
                            'metadata_items': metadata_items, 
                            'injected_files': injected_files,
                            'injected_file_content_bytes': injected_file_content_bytes,
                            'injected_file_path_bytes': injected_file_path_bytes,
                            'security_groups': security_groups,
                            'security_group_rules': security_group_rules,
                            'key_pairs': key_pairs,
                            "id": tenant_id}

        };

        for (var key in data.quota_set) {
            if (data.quota_set[key] == undefined) {
                delete data.quota_set[key];
            }
        }   

        onOK = function (result) {
            if (callback !== undefined) {
                callback(result);
            }
        };
        onError = function (message) {
            if (error !== undefined) {
                error(message);
            }
        };

        JS.Comm.put(url, data, JS.Keystone.params.token, onOK, onError);
    };

    // List the default quota
    // tenant_id:  Id of the tenant for which we list the default quota

    getdefaultquotalist = function (tenant_id, callback, error, region) {
        var url, onOK, onError;
        if (!check(region)) {
            return;
        }

        url = params.url + '/os-quota-sets/' + tenant_id + '/defaults';

        onOK = function (result) {
            if (callback !== undefined) {
                callback(result);
            }
        };
        onError = function (message) {
            if (error !== undefined) {
                error(message);
            }
        };

        JS.Comm.get(url, JS.Keystone.params.token, onOK, onError);
    };


    // APIs for security groups

    // List the security groups

    getsecuritygrouplist = function (callback, error, region) {
        var url, onOK, onError;
        if (!check(region)) {
            return;
        }

        url = params.url + '/os-security-groups';

        onOK = function (result) {
            if (callback !== undefined) {
                callback(result);
            }
        };
        onError = function (message) {
            if (error !== undefined) {
                error(message);
            }
        };

        JS.Comm.get(url, JS.Keystone.params.token, onOK, onError);
    };

     // Creates a new security group
     // name: name of the new security group
     // description: description for the creating security group

    createsecuritygroup = function (name, description, callback, error, region) {
        var url, data, onOK, onError;
        if (!check(region)) {
            return;
        }

        url = params.url + '/os-security-groups';

        data = {"security_group": {
                    "name": name,
                    "description": description
                    }
        };

        onOK = function (result) {
            console.log(callback);
            if (callback !== undefined) {
                callback(result);
            }
        };
        onError = function (message) {
            if (error !== undefined) {
                error(message);
            }
        };

        JS.Comm.post(url, data, JS.Keystone.params.token, onOK, onError);

    };

    // Returns details for the specific security group
    // sec_group_id: Id of the consulting security group

    getsecuritygroupdetail = function (sec_group_id, callback, error, region) {
        var url, onOK, onError;
        if (!check(region)) {
            return;
        }

        url = params.url + '/os-security-groups/' + sec_group_id;

        onOK = function (result) {
            if (callback !== undefined) {
                callback(result);
            }
        };
        onError = function (message) {
            if (error !== undefined) {
                error(message);
            }
        };

        JS.Comm.get(url, JS.Keystone.params.token, onOK, onError);

    };

    // Deletes a security group
    // sec_group_id: Id of the security group to delete

    deletesecuritygroup = function (sec_group_id, callback, error, region) {
        var url, onOK, onError;
        if (!check(region)) {
            return;
        }

        url = params.url + '/os-security-groups/' + sec_group_id;

        onOK = function (result) {
            if (callback !== undefined) {
                callback(result);
            }
        };
        onError = function (message) {
            if (error !== undefined) {
                error(message);
            }
        };

        JS.Comm.del(url, JS.Keystone.params.token, onOK, onError);

    };

    // Creates a security group rule
    // ip_protocol, from_port, to_port, cidr, group_id, parent_group_id: New parameters for
    // the creating security group rule

    createsecuritygrouprule = function (ip_protocol, from_port, to_port, cidr, group_id, parent_group_id, callback, error, region) {
        var url, data, onOK, onError;
        if (!check(region)) {
            return;
        }

        url = params.url + '/os-security-group-rules';

        data = {
                "security_group_rule": {
                    "ip_protocol": ip_protocol,
                    "from_port": from_port,
                    "to_port": to_port,
                    "cidr": cidr,
                    "group_id": group_id,
                    "parent_group_id": parent_group_id
                    }
        };

        onOK = function (result) {
            if (callback !== undefined) {
                callback(result);
            }
        };
        onError = function (message) {
            if (error !== undefined) {
                error(message);
            }
        };

        JS.Comm.post(url, data, JS.Keystone.params.token, onOK, onError);

    };

    // Deletes security group rule
    // sec_group_rule_id: Id of the security group rule

    deletesecuritygrouprule = function (sec_group_rule_id, callback, error, region) {
        var url, onOK, onError;
        if (!check(region)) {
            return;
        }

        url = params.url + '/os-security-group-rules/' + sec_group_rule_id;

        onOK = function (result) {
            if (callback !== undefined) {
                callback(result);
            }
        };
        onError = function (message) {
            if (error !== undefined) {
                error(message);
            }
        };

        JS.Comm.del(url, JS.Keystone.params.token, onOK, onError);

    };

    // Consults security group for specific server
    // server_id: Id of the server for which to consult the security group

    getsecuritygroupforserver = function (server_id, callback, error, region) {
        var url, onOK, onError;
        if (!check(region)) {
            return;
        }

        url = params.url + '/servers/' + server_id + '/os-security-groups';

        onOK = function (result) {
            if (callback !== undefined) {
                callback(result);
            }
        };
        onError = function (message) {
            if (error !== undefined) {
                error(message);
            }
        };

        JS.Comm.get(url, JS.Keystone.params.token, onOK, onError);

    };

    // APIs for floating IPs

    getfloatingIPpools = function (callback, error, region) {
        var url, onOK, onError;
        if (!check(region)) {
            return;
        }

        url = params.url + '/os-floating-ip-pools';

        onOK = function (result) {
            if (callback !== undefined) {
                callback(result);
            }
        };
        onError = function (message) {
            error(message);
            throw new Error(message);
        };

        JS.Comm.get(url, JS.Keystone.params.token, onOK, onError);

    };

    getfloatingIPs = function (callback, error, region) {
        var url, onOK, onError;
        if (!check(region)) {
            return;
        }

        url = params.url + '/os-floating-ips';

        onOK = function (result) {
            if (callback !== undefined) {
                callback(result);
            }
        };
        onError = function (message) {
            error(message);
            throw new Error(message);
        };

        JS.Comm.get(url, JS.Keystone.params.token, onOK, onError);

    };

    getfloatingIPdetail = function (id, callback, error, region) {
        var url, onOK, onError;
        if (!check(region)) {
            return;
        }

        url = params.url + '/os-floating-ips/' +id;

        onOK = function (result) {
            if (callback !== undefined) {
                callback(result);
            }
        };
        onError = function (message) {
            error(message);
            throw new Error(message);
        };

        JS.Comm.get(url, JS.Keystone.params.token, onOK, onError);

    };

    allocatefloatingIP = function (pool, callback, error, region) {
        var url, onOK, onError, data;
        if (!check(region)) {
            return;
        }

        url = params.url + '/os-floating-ips';

        if (pool !== undefined) {

            data = {

                "pool": pool
            };
        }         

        onOK = function (result) {
            if (callback !== undefined) {
                callback(result);
            }
        };
        onError = function (message) {
            error(message);
            throw new Error(message);
        };

        JS.Comm.post(url, data, JS.Keystone.params.token, onOK, onError);

    };

    associatefloatingIP = function (server_id, address, fixed_address, callback, error, region) {
        var url, onOK, onError, data;
        if (!check(region)) {
            return;
        }

        url = params.url + '/servers/' + server_id + '/action';

        data =  {
                "addFloatingIp": {
                    "address": address
                }
        };

        if (fixed_address !== undefined) {
            data.addFloatingIp["fixed_address"] = fixed_address;
        }

        onOK = function (result) {
            if (callback !== undefined) {
                callback(result);
            }
        };
        onError = function (message) {
            error(message);
            throw new Error(message);
        };

        JS.Comm.post(url, data, JS.Keystone.params.token, onOK, onError);

    };

    releasefloatingIP = function (id, callback, error, region) {
        var url, onOK, onError;
        if (!check(region)) {
            return;
        }

        url = params.url + '/os-floating-ips/' +id;

        onOK = function (result) {
            if (callback !== undefined) {
                callback(result);
            }
        };
        onError = function (message) {
            error(message);
            throw new Error(message);
        };

        JS.Comm.del(url, JS.Keystone.params.token, onOK, onError);

    };


    disassociatefloatingIP = function (server_id, address, callback, error, region) {
        var url, onOK, onError, data;
        if (!check(region)) {
            return;
        }

        url = params.url + '/servers/' + server_id + '/action';

        data =  {
                "removeFloatingIp": {
                    "address": address
                }
        };

        onOK = function (result) {
            if (callback !== undefined) {
                callback(result);
            }
        };
        onError = function (message) {
            error(message);
            throw new Error(message);
        };

        JS.Comm.post(url, data, JS.Keystone.params.token, onOK, onError);

    };


    // Public Functions and Variables
    // ------------------------------
    // This is the list of available public functions and variables
    return {

        // Functions:
        configure : configure,
        params : params,
        getserverlist : getserverlist,
        getserverdetail : getserverdetail,
        getserverips : getserverips,
        updateserver : updateserver,
        createserver : createserver,
        deleteserver : deleteserver,
        changepasswordserver : changepasswordserver,
        rebootserverhard : rebootserverhard,
        rebootserversoft : rebootserversoft,
        resizeserver : resizeserver,
        confirmresizedserver : confirmresizedserver,
        revertresizedserver : revertresizedserver,
        startserver : startserver,
        stopserver : stopserver,
        pauseserver : pauseserver,
        unpauseserver : unpauseserver,
        suspendserver : suspendserver,
        resumeserver : resumeserver,
        createimage : createimage,
        getflavorlist : getflavorlist,
        getflavordetail : getflavordetail,
        createflavor : createflavor,
        deleteflavor : deleteflavor,
        getimagelist : getimagelist,
        getimagedetail : getimagedetail,
        deleteimage : deleteimage,
        getkeypairlist : getkeypairlist,
        createkeypair : createkeypair,
        deletekeypair : deletekeypair,
        getkeypairdetail : getkeypairdetail,
        getvncconsole : getvncconsole,
        getconsoleoutput : getconsoleoutput,
        getattachedvolumes : getattachedvolumes,
        attachvolume : attachvolume,
        detachvolume : detachvolume,
        getattachedvolume : getattachedvolume,
        getquotalist : getquotalist,
        updatequota : updatequota,
        getdefaultquotalist : getdefaultquotalist,
        getsecuritygrouplist : getsecuritygrouplist,
        createsecuritygroup : createsecuritygroup,
        getsecuritygroupdetail : getsecuritygroupdetail,
        deletesecuritygroup : deletesecuritygroup,
        createsecuritygrouprule : createsecuritygrouprule,
        deletesecuritygrouprule : deletesecuritygrouprule,
        getsecuritygroupforserver : getsecuritygroupforserver,
        getfloatingIPpools : getfloatingIPpools,
        getfloatingIPs : getfloatingIPs,
        getfloatingIPdetail : getfloatingIPdetail,
        allocatefloatingIP : allocatefloatingIP,
        associatefloatingIP : associatefloatingIP,
        disassociatefloatingIP : disassociatefloatingIP,
        releasefloatingIP : releasefloatingIP
    };

}(JSTACK));
;
define('ui/components/machine/driver-fiwarelab/component', ['exports', 'ember', 'ui/mixins/driver'], function (exports, _ember, _uiMixinsDriver) {
  exports['default'] = _ember['default'].Component.extend(_uiMixinsDriver['default'], {
    driverName     : 'fiwarelab',
    fiwareImages   : fiwareImages,
    fiwareRegions  : fiwareRegions,
    fiwareFlavors  : [],
    fiwareSecGroups: [],
    fiwareNetworks : [],
    fiwarefippool  : [],
    tenants        : [],
    regions        : [],
    secGroups      : [],
    toggleSec      : "dropdown-content", 
    step           : 1,
    isStep1        : Ember.computed.equal('step', 1),
    isStep2        : Ember.computed.equal('step', 2),
    isStep3        : Ember.computed.equal('step', 3),
    isStep4        : Ember.computed.equal('step', 4),

    // Write your component here, starting with setting 'model' to a machine with your config populated
    bootstrap: function() {
      let store = this.get('store');
      let config = store.createRecord({
        type            : 'fiwarelabConfig',
        username        : '',
        password        : '',
        tenantId        : '',
        region          : '',
        authUrl         : 'http://cloud.lab.fiware.org:4730/v2.0/',
        authUrlv3       : 'http://cloud.lab.fiware.org:4730/v3/',
        imageName       : 'base_ubuntu_14.04',
        secGroups       : '',
        netName         : '',
        floatingipPool  : '',
        flavorName      : 'm1.small',
        sshUser         : 'ubuntu',
        sshPort         : 22,
      });
      let type = 'host';

      if (!this.get('useHost')) {
        type = 'machine';
      }
      this.set('model', store.createRecord({
        type: type,
        'fiwarelabConfig': config,
      }));
    },

    // Add custom validation beyond what can be done from the config API schema
    validate() {
      // Get generic API validation errors
      this._super(); 
      var errors = this.get('errors')||[];

      // Set the array of errors for display,
      // and return true if saving should continue.
      if ( errors.get('length') )
      {
        this.set('errors', errors);
        return false;
      }
      else
      {
        this.set('errors', null);
        return true;
      }
    },

    actions: {
       authenticated: function(obj){
         let self = this;
         function SecGroups(obj){
           self.set('fiwareSecGroups', obj.security_groups);
         }

         function Flavors(obj){
           self.set('fiwareFlavors', obj.flavors);
         }

         function fip(obj){
           self.set('model.fiwarelabConfig.floatingipPool', obj.floating_ip_pools[0]['name']);
           self.set('fiwarefippool', obj.floating_ip_pools);
         }

         function networks(obj){
           //removing external networks
           obj = obj.filter(item => item['router:external'] !== true);
           self.set('model.fiwarelabConfig.netName', obj[0]['name']);
           self.set('fiwareNetworks', obj);
         }

         function err(err){
           self.set('errors', [err]);
           return false;
         }

         JSTACK.Nova.params.baseurl = this.get('settings').get('api$host') + '/v2-beta/proxy/';
         JSTACK.Nova.getflavorlist(null, Flavors, err, this.get('model.fiwarelabConfig.region'));
         JSTACK.Nova.getfloatingIPpools(fip, err, this.get('model.fiwarelabConfig.region'));
         JSTACK.Nova.getsecuritygrouplist(SecGroups, err, this.get('model.fiwarelabConfig.region'));
         JSTACK.Neutron.params.baseurl = this.get('settings').get('api$host') + '/v2-beta/proxy/'
         JSTACK.Neutron.getnetworkslist(networks, err, this.get('model.fiwarelabConfig.region'));
         this.set('step', 4);
       },
       auth_err: function(err) {
         // still very basic error handling
         if (err === 3){
           this.set('errors', ['(401) Unauthorized.'])
           return false;
         }
       },
       authenticate: function(){ 
         var errors = []; 
         this.set('errors', []);
         let self = this;
         if(!this.get('model.fiwarelabConfig.username')) {
           errors.push('Username required.');
         }
         if(!this.get('model.fiwarelabConfig.password')) {
           errors.push('Password required.');
         }
         if (errors.get('length')){
           this.set('errors', errors);
           return false;
         }
         function send_auth_err(err){
           self.send('auth_err', err);
         }
         function send_authenticated(obj){
           self.send('authenticated', obj);
         }
         function getTenants(token){
           function validate_tenants(tenants){
             tenants = tenants.tenants
             tenants = tenants.filter(item => item['is_cloud_project']);
             if (tenants.length == 1) {
               tenant = tenants[0];
               self.set('model.fiwarelabConfig.tenantId', tenant.id);
               self.send('checkTenant');
             } else {
               self.set('step', 2);
               self.set('model.fiwarelabConfig.tenantId', tenants[0]['id']); 
               self.set('tenants', tenants);
               tenant = tenants[0];
             } 
           }
           JSTACK.Keystone.gettenants(validate_tenants); 
         }

         JSTACK.Keystone.init(this.get('settings').get('api$host') + '/v2-beta/proxy/' + this.get('model.fiwarelabConfig.authUrl'));
         JSTACK.Keystone.authenticate(this.get('model.fiwarelabConfig.username'),
                                      this.get('model.fiwarelabConfig.password'), 
                                      undefined, 
                                      undefined, 
                                      getTenants,
                                      send_auth_err);
      },
       checkRegion: function(obj){
         let endpoints = obj.access.serviceCatalog;
         let compute_endpoint = endpoints.filterBy('type', 'compute');
         let regions = [];
         for (i=0; i < compute_endpoint[0].endpoints.length; i++){
          if(!(regions.includes(compute_endpoint[0].endpoints[i]['region']))){
            regions.push(compute_endpoint[0].endpoints[i]['region'])
          }
         };
         if (regions.length == 1){
          this.set('model.fiwarelabConfig.region', regions[0]);
          this.send('authenticated');
         } else {
          this.set('regions', regions);
          this.set('model.fiwarelabConfig.region', regions[0]);
          this.set('step', 3);
         }
       },
       regionSelected: function(){
        this.send('authenticated');
       },
       checkTenant: function(){
         let self = this;
         function send_auth_err(err) {
           self.send('auth_err', err);
         }
         function send_authenticated(obj){
           self.send('authenticated', obj);
         }
         function send_check_region(obj){
          self.send('checkRegion', obj);
         }
         /*Workaround to retrieve Region for user
                   First, the user is authenticated using keystone v2 endpoint to retrieve tenant information
                   then keystone v3 endpoint is used to retrieve regions associated with that tenant  */
         JSTACK.Keystone.init(self.get('settings').get('api$host') + '/v2-beta/proxy/' + self.get('model.fiwarelabConfig.authUrlv3'));
         JSTACK.Keystone.authenticate(self.get('model.fiwarelabConfig.username'),
                                      self.get('model.fiwarelabConfig.password'),
                                      undefined, self.get('model.fiwarelabConfig.tenantId'), send_check_region, send_auth_err);
      },
       instanceConfig: function(){
         this.set('errors', null);
         if(!this.get('model.hostname')) {
           this.set('errors', ['Name required.']);
           return;
         }
         if(!this.get('model.fiwarelabConfig.netName')) {
           this.set('errors', ['Network name required.']);
           return;
         }
         this.set('step', 3);
      },
       back: function(){
         this.set('step', this.get('step')-1);
      },
       selectImage: function(slug){
        this.set('model.fiwarelabConfig.imageName', slug);
        image = fiwareImages.filter(item => item['slug'] === slug);
        this.set('model.fiwarelabConfig.sshUser', image[0]['ssh_user']); 
      },
       toggleVisible: function(){
        if (this.get('toggleSec') == 'dropdown-content'){
          this.set('toggleSec', 'dropdown-content-visible');
        } else {
          this.set('toggleSec', 'dropdown-content');
        }
       },
       secGroupList: function(item, isChecked){
        if(isChecked){
          this.get('secGroups').addObject(item);
        } else {
          this.get('secGroups').removeObject(item);
        }
          this.set('model.fiwarelabConfig.secGroups', this.get('secGroups').join());
       },
    },
  });
});
;
// Copyright (c) 2017. Zuercher Hochschule fuer Angewandte Wissenschaften
// All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License"); you may
// not use this file except in compliance with the License. You may obtain
// a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
// WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
// License for the specific language governing permissions and limitations
// under the License.
//
// AUTHOR: Bruno Grazioli

let fiwareImages = [
  {
    "slug"    : "base_ubuntu_14.04",
    "name"    : "Ubuntu 14.04 LTS",
    "ssh_user": "ubuntu" 
  },
  {
    "slug"    : "base_ubuntu_12.04",
    "name"    : "Ubuntu 12.04 LTS",
    "ssh_user": "ubuntu"
  },
  {
    "slug"    : "base_centos_7",
    "name"    : "CentOS 7 Generic Cloud",
    "ssh_user": "centos"
  },
  {
    "slug"    : "base_centos_6",
    "name"    : "CentOS 6 Generic Cloud",
    "ssh_user": "centos"
  },
];

let fiwareRegions = [
  {
    "name": "Britanny"
  },
  {
    "name": "Budapest2"
  },
  {
    "name": "Budapest3"
  },
  {
    "name": "Crete"
  },
  {
    "name": "Genoa"
  },
  {
    "name": "Lannion3"
  },
  {
    "name": "Lannion4"
  },
  {
    "name": "Mexico"
  },
  {
    "name": "Poznan"
  },
  {
    "name": "SaoPaulo"
  },
  {
    "name": "SophiaAntipolis2"
  },
  {
    "name": "Spain2"
  },
  {
    "name": "SpainTenerife"
  },
  {
    "name": "Trento2"
  },
  {
    "name": "Vicenza"
  },
  {
    "name": "Volos"
  },
  {
    "name": "Wroclaw"
  },
  {
    "name": "Zurich2"
  },
  {
    "name": "ZurichS"
  },
];
;
define("ui/components/machine/driver-fiwarelab/template",["exports","ember","ui/mixins/driver"],function(exports,_ember,_uiMixinsDriver){

exports["default"] = Ember.HTMLBars.template((function() {
  var child0 = (function() {
    return {
      meta: {
        "revision": "Ember@2.9.1",
        "loc": {
          "source": null,
          "start": {
            "line": 4,
            "column": 4
          },
          "end": {
            "line": 33,
            "column": 4
          }
        }
      },
      isEmpty: false,
      arity: 0,
      cachedFragment: null,
      hasRendered: false,
      buildFragment: function buildFragment(dom) {
        var el0 = dom.createDocumentFragment();
        var el1 = dom.createTextNode("    ");
        dom.appendChild(el0, el1);
        var el1 = dom.createElement("div");
        dom.setAttribute(el1,"class","over-hr r-mt20 r-mb20");
        var el2 = dom.createTextNode("\n      ");
        dom.appendChild(el1, el2);
        var el2 = dom.createElement("span");
        var el3 = dom.createTextNode("ACCOUNT ACCESS");
        dom.appendChild(el2, el3);
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n    ");
        dom.appendChild(el1, el2);
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n\n    ");
        dom.appendChild(el0, el1);
        var el1 = dom.createElement("div");
        dom.setAttribute(el1,"class","row form-group");
        var el2 = dom.createTextNode("\n      ");
        dom.appendChild(el1, el2);
        var el2 = dom.createElement("div");
        dom.setAttribute(el2,"class","col-md-1");
        var el3 = dom.createTextNode("\n        ");
        dom.appendChild(el2, el3);
        var el3 = dom.createElement("div");
        dom.setAttribute(el3,"class","form-label");
        var el4 = dom.createTextNode("\n          ");
        dom.appendChild(el3, el4);
        var el4 = dom.createElement("label");
        dom.setAttribute(el4,"class","form-control-static");
        var el5 = dom.createTextNode("Username*");
        dom.appendChild(el4, el5);
        dom.appendChild(el3, el4);
        var el4 = dom.createTextNode("\n        ");
        dom.appendChild(el3, el4);
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n      ");
        dom.appendChild(el2, el3);
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n      ");
        dom.appendChild(el1, el2);
        var el2 = dom.createElement("div");
        dom.setAttribute(el2,"class","col-md-5");
        var el3 = dom.createTextNode("\n        ");
        dom.appendChild(el2, el3);
        var el3 = dom.createComment("");
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n      ");
        dom.appendChild(el2, el3);
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n      ");
        dom.appendChild(el1, el2);
        var el2 = dom.createElement("div");
        dom.setAttribute(el2,"class","col-md-1");
        var el3 = dom.createTextNode("\n        ");
        dom.appendChild(el2, el3);
        var el3 = dom.createElement("div");
        dom.setAttribute(el3,"class","form-label");
        var el4 = dom.createTextNode("\n          ");
        dom.appendChild(el3, el4);
        var el4 = dom.createElement("label");
        dom.setAttribute(el4,"class","form-control-static");
        var el5 = dom.createTextNode("Password*");
        dom.appendChild(el4, el5);
        dom.appendChild(el3, el4);
        var el4 = dom.createTextNode("\n        ");
        dom.appendChild(el3, el4);
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n      ");
        dom.appendChild(el2, el3);
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n      ");
        dom.appendChild(el1, el2);
        var el2 = dom.createElement("div");
        dom.setAttribute(el2,"class","col-md-5");
        var el3 = dom.createTextNode("\n        ");
        dom.appendChild(el2, el3);
        var el3 = dom.createComment("");
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n      ");
        dom.appendChild(el2, el3);
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n    ");
        dom.appendChild(el1, el2);
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n\n    ");
        dom.appendChild(el0, el1);
        var el1 = dom.createElement("div");
        dom.setAttribute(el1,"class","footer-actions");
        var el2 = dom.createTextNode("\n        ");
        dom.appendChild(el1, el2);
        var el2 = dom.createElement("button");
        dom.setAttribute(el2,"name","submit");
        dom.setAttribute(el2,"class","btn bg-primary");
        var el3 = dom.createTextNode("Next: Select instance configuration");
        dom.appendChild(el2, el3);
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n    ");
        dom.appendChild(el1, el2);
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n    ");
        dom.appendChild(el0, el1);
        var el1 = dom.createComment("");
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n\n");
        dom.appendChild(el0, el1);
        return el0;
      },
      buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
        var element25 = dom.childAt(fragment, [3]);
        var element26 = dom.childAt(fragment, [5, 1]);
        var morphs = new Array(4);
        morphs[0] = dom.createMorphAt(dom.childAt(element25, [3]),1,1);
        morphs[1] = dom.createMorphAt(dom.childAt(element25, [7]),1,1);
        morphs[2] = dom.createElementMorph(element26);
        morphs[3] = dom.createMorphAt(fragment,7,7,contextualElement);
        return morphs;
      },
      statements: [
        ["inline","input",[],["type","text","name","username","value",["subexpr","@mut",[["get","model.fiwarelabConfig.username",["loc",[null,[16,50],[16,80]]],0,0,0,0]],[],[],0,0],"classNames","form-control","placeholder","FIWARE Lab username"],["loc",[null,[16,8],[16,142]]],0,0],
        ["inline","input",[],["type","password","name","password","value",["subexpr","@mut",[["get","model.fiwarelabConfig.password",["loc",[null,[24,54],[24,84]]],0,0,0,0]],[],[],0,0],"classNames","form-control","placeholder","FIWARE Lab password"],["loc",[null,[24,8],[24,146]]],0,0],
        ["element","action",["authenticate"],[],["loc",[null,[29,16],[29,41]]],0,0],
        ["inline","top-errors",[],["errors",["subexpr","@mut",[["get","errors",["loc",[null,[31,24],[31,30]]],0,0,0,0]],[],[],0,0]],["loc",[null,[31,4],[31,32]]],0,0]
      ],
      locals: [],
      templates: []
    };
  }());
  var child1 = (function() {
    var child0 = (function() {
      var child0 = (function() {
        return {
          meta: {
            "revision": "Ember@2.9.1",
            "loc": {
              "source": null,
              "start": {
                "line": 47,
                "column": 10
              },
              "end": {
                "line": 49,
                "column": 10
              }
            }
          },
          isEmpty: false,
          arity: 1,
          cachedFragment: null,
          hasRendered: false,
          buildFragment: function buildFragment(dom) {
            var el0 = dom.createDocumentFragment();
            var el1 = dom.createTextNode("            ");
            dom.appendChild(el0, el1);
            var el1 = dom.createElement("option");
            var el2 = dom.createComment("");
            dom.appendChild(el1, el2);
            dom.appendChild(el0, el1);
            var el1 = dom.createTextNode("\n");
            dom.appendChild(el0, el1);
            return el0;
          },
          buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
            var element22 = dom.childAt(fragment, [1]);
            var morphs = new Array(3);
            morphs[0] = dom.createAttrMorph(element22, 'value');
            morphs[1] = dom.createAttrMorph(element22, 'selected');
            morphs[2] = dom.createMorphAt(element22,0,0);
            return morphs;
          },
          statements: [
            ["attribute","value",["get","choice.id",["loc",[null,[48,28],[48,37]]],0,0,0,0],0,0,0,0],
            ["attribute","selected",["subexpr","eq",[["get","model.fiwarelabConfig.tenantId",["loc",[null,[48,54],[48,84]]],0,0,0,0],["get","choice.id",["loc",[null,[48,85],[48,94]]],0,0,0,0]],[],["loc",[null,[null,null],[48,96]]],0,0],0,0,0,0],
            ["content","choice.id",["loc",[null,[48,97],[48,110]]],0,0,0,0]
          ],
          locals: ["choice"],
          templates: []
        };
      }());
      return {
        meta: {
          "revision": "Ember@2.9.1",
          "loc": {
            "source": null,
            "start": {
              "line": 33,
              "column": 4
            },
            "end": {
              "line": 58,
              "column": 4
            }
          }
        },
        isEmpty: false,
        arity: 0,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createTextNode("\n     ");
          dom.appendChild(el0, el1);
          var el1 = dom.createElement("div");
          dom.setAttribute(el1,"class","over-hr r-mt20 r-mb20");
          var el2 = dom.createTextNode("\n      ");
          dom.appendChild(el1, el2);
          var el2 = dom.createElement("span");
          var el3 = dom.createTextNode("Project ID");
          dom.appendChild(el2, el3);
          dom.appendChild(el1, el2);
          var el2 = dom.createTextNode("\n     ");
          dom.appendChild(el1, el2);
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode("\n\n     ");
          dom.appendChild(el0, el1);
          var el1 = dom.createElement("div");
          dom.setAttribute(el1,"class","row form-group");
          var el2 = dom.createTextNode("\n      ");
          dom.appendChild(el1, el2);
          var el2 = dom.createElement("div");
          dom.setAttribute(el2,"class","col-md-1");
          var el3 = dom.createTextNode("\n        ");
          dom.appendChild(el2, el3);
          var el3 = dom.createElement("div");
          dom.setAttribute(el3,"class","form-label");
          var el4 = dom.createTextNode("\n          ");
          dom.appendChild(el3, el4);
          var el4 = dom.createElement("label");
          dom.setAttribute(el4,"class","form-control-static");
          var el5 = dom.createTextNode("Project ID*");
          dom.appendChild(el4, el5);
          dom.appendChild(el3, el4);
          var el4 = dom.createTextNode("\n        ");
          dom.appendChild(el3, el4);
          dom.appendChild(el2, el3);
          var el3 = dom.createTextNode("\n      ");
          dom.appendChild(el2, el3);
          dom.appendChild(el1, el2);
          var el2 = dom.createTextNode("\n      ");
          dom.appendChild(el1, el2);
          var el2 = dom.createElement("div");
          dom.setAttribute(el2,"class","col-md-11");
          var el3 = dom.createTextNode("\n        ");
          dom.appendChild(el2, el3);
          var el3 = dom.createElement("select");
          dom.setAttribute(el3,"class","form-control");
          var el4 = dom.createTextNode("\n");
          dom.appendChild(el3, el4);
          var el4 = dom.createComment("");
          dom.appendChild(el3, el4);
          var el4 = dom.createTextNode("        ");
          dom.appendChild(el3, el4);
          dom.appendChild(el2, el3);
          var el3 = dom.createTextNode("\n      ");
          dom.appendChild(el2, el3);
          dom.appendChild(el1, el2);
          var el2 = dom.createTextNode("\n    ");
          dom.appendChild(el1, el2);
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode("\n\n    ");
          dom.appendChild(el0, el1);
          var el1 = dom.createElement("div");
          dom.setAttribute(el1,"class","footer-actions");
          var el2 = dom.createTextNode("\n        ");
          dom.appendChild(el1, el2);
          var el2 = dom.createElement("button");
          dom.setAttribute(el2,"name","submit");
          dom.setAttribute(el2,"class","btn bg-primary");
          var el3 = dom.createTextNode("Next: Select instance configuration");
          dom.appendChild(el2, el3);
          dom.appendChild(el1, el2);
          var el2 = dom.createTextNode("\n    ");
          dom.appendChild(el1, el2);
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode("\n\n");
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
          var element23 = dom.childAt(fragment, [3, 3, 1]);
          var element24 = dom.childAt(fragment, [5, 1]);
          var morphs = new Array(3);
          morphs[0] = dom.createAttrMorph(element23, 'onchange');
          morphs[1] = dom.createMorphAt(element23,1,1);
          morphs[2] = dom.createElementMorph(element24);
          return morphs;
        },
        statements: [
          ["attribute","onchange",["subexpr","action",[["subexpr","mut",[["get","model.fiwarelabConfig.tenantId",["loc",[null,[46,60],[46,90]]],0,0,0,0]],[],["loc",[null,[46,55],[46,91]]],0,0]],["value","target.value"],["loc",[null,[null,null],[46,114]]],0,0],0,0,0,0],
          ["block","each",[["get","tenants",["loc",[null,[47,18],[47,25]]],0,0,0,0]],[],0,null,["loc",[null,[47,10],[49,19]]]],
          ["element","action",["checkTenant"],[],["loc",[null,[55,16],[55,40]]],0,0]
        ],
        locals: [],
        templates: [child0]
      };
    }());
    var child1 = (function() {
      var child0 = (function() {
        var child0 = (function() {
          return {
            meta: {
              "revision": "Ember@2.9.1",
              "loc": {
                "source": null,
                "start": {
                  "line": 72,
                  "column": 10
                },
                "end": {
                  "line": 74,
                  "column": 10
                }
              }
            },
            isEmpty: false,
            arity: 1,
            cachedFragment: null,
            hasRendered: false,
            buildFragment: function buildFragment(dom) {
              var el0 = dom.createDocumentFragment();
              var el1 = dom.createTextNode("            ");
              dom.appendChild(el0, el1);
              var el1 = dom.createElement("option");
              var el2 = dom.createComment("");
              dom.appendChild(el1, el2);
              dom.appendChild(el0, el1);
              var el1 = dom.createTextNode("\n");
              dom.appendChild(el0, el1);
              return el0;
            },
            buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
              var element19 = dom.childAt(fragment, [1]);
              var morphs = new Array(3);
              morphs[0] = dom.createAttrMorph(element19, 'value');
              morphs[1] = dom.createAttrMorph(element19, 'selected');
              morphs[2] = dom.createMorphAt(element19,0,0);
              return morphs;
            },
            statements: [
              ["attribute","value",["get","choice",["loc",[null,[73,28],[73,34]]],0,0,0,0],0,0,0,0],
              ["attribute","selected",["subexpr","eq",[["get","model.fiwarelabConfig.region",["loc",[null,[73,51],[73,79]]],0,0,0,0],["get","choice",["loc",[null,[73,80],[73,86]]],0,0,0,0]],[],["loc",[null,[null,null],[73,88]]],0,0],0,0,0,0],
              ["content","choice",["loc",[null,[73,89],[73,99]]],0,0,0,0]
            ],
            locals: ["choice"],
            templates: []
          };
        }());
        return {
          meta: {
            "revision": "Ember@2.9.1",
            "loc": {
              "source": null,
              "start": {
                "line": 58,
                "column": 4
              },
              "end": {
                "line": 83,
                "column": 4
              }
            }
          },
          isEmpty: false,
          arity: 0,
          cachedFragment: null,
          hasRendered: false,
          buildFragment: function buildFragment(dom) {
            var el0 = dom.createDocumentFragment();
            var el1 = dom.createTextNode("\n     ");
            dom.appendChild(el0, el1);
            var el1 = dom.createElement("div");
            dom.setAttribute(el1,"class","over-hr r-mt20 r-mb20");
            var el2 = dom.createTextNode("\n      ");
            dom.appendChild(el1, el2);
            var el2 = dom.createElement("span");
            var el3 = dom.createTextNode("Select Region");
            dom.appendChild(el2, el3);
            dom.appendChild(el1, el2);
            var el2 = dom.createTextNode("\n     ");
            dom.appendChild(el1, el2);
            dom.appendChild(el0, el1);
            var el1 = dom.createTextNode("\n\n     ");
            dom.appendChild(el0, el1);
            var el1 = dom.createElement("div");
            dom.setAttribute(el1,"class","row form-group");
            var el2 = dom.createTextNode("\n      ");
            dom.appendChild(el1, el2);
            var el2 = dom.createElement("div");
            dom.setAttribute(el2,"class","col-md-1");
            var el3 = dom.createTextNode("\n        ");
            dom.appendChild(el2, el3);
            var el3 = dom.createElement("div");
            dom.setAttribute(el3,"class","form-label");
            var el4 = dom.createTextNode("\n          ");
            dom.appendChild(el3, el4);
            var el4 = dom.createElement("label");
            dom.setAttribute(el4,"class","form-control-static");
            var el5 = dom.createTextNode("Region*");
            dom.appendChild(el4, el5);
            dom.appendChild(el3, el4);
            var el4 = dom.createTextNode("\n        ");
            dom.appendChild(el3, el4);
            dom.appendChild(el2, el3);
            var el3 = dom.createTextNode("\n      ");
            dom.appendChild(el2, el3);
            dom.appendChild(el1, el2);
            var el2 = dom.createTextNode("\n      ");
            dom.appendChild(el1, el2);
            var el2 = dom.createElement("div");
            dom.setAttribute(el2,"class","col-md-11");
            var el3 = dom.createTextNode("\n        ");
            dom.appendChild(el2, el3);
            var el3 = dom.createElement("select");
            dom.setAttribute(el3,"class","form-control");
            var el4 = dom.createTextNode("\n");
            dom.appendChild(el3, el4);
            var el4 = dom.createComment("");
            dom.appendChild(el3, el4);
            var el4 = dom.createTextNode("        ");
            dom.appendChild(el3, el4);
            dom.appendChild(el2, el3);
            var el3 = dom.createTextNode("\n      ");
            dom.appendChild(el2, el3);
            dom.appendChild(el1, el2);
            var el2 = dom.createTextNode("\n    ");
            dom.appendChild(el1, el2);
            dom.appendChild(el0, el1);
            var el1 = dom.createTextNode("\n\n    ");
            dom.appendChild(el0, el1);
            var el1 = dom.createElement("div");
            dom.setAttribute(el1,"class","footer-actions");
            var el2 = dom.createTextNode("\n        ");
            dom.appendChild(el1, el2);
            var el2 = dom.createElement("button");
            dom.setAttribute(el2,"name","submit");
            dom.setAttribute(el2,"class","btn bg-primary");
            var el3 = dom.createTextNode("Next: Select instance configuration");
            dom.appendChild(el2, el3);
            dom.appendChild(el1, el2);
            var el2 = dom.createTextNode("\n    ");
            dom.appendChild(el1, el2);
            dom.appendChild(el0, el1);
            var el1 = dom.createTextNode("\n\n");
            dom.appendChild(el0, el1);
            return el0;
          },
          buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
            var element20 = dom.childAt(fragment, [3, 3, 1]);
            var element21 = dom.childAt(fragment, [5, 1]);
            var morphs = new Array(3);
            morphs[0] = dom.createAttrMorph(element20, 'onchange');
            morphs[1] = dom.createMorphAt(element20,1,1);
            morphs[2] = dom.createElementMorph(element21);
            return morphs;
          },
          statements: [
            ["attribute","onchange",["subexpr","action",[["subexpr","mut",[["get","model.fiwarelabConfig.region",["loc",[null,[71,60],[71,88]]],0,0,0,0]],[],["loc",[null,[71,55],[71,89]]],0,0]],["value","target.value"],["loc",[null,[null,null],[71,112]]],0,0],0,0,0,0],
            ["block","each",[["get","regions",["loc",[null,[72,18],[72,25]]],0,0,0,0]],[],0,null,["loc",[null,[72,10],[74,19]]]],
            ["element","action",["regionSelected"],[],["loc",[null,[80,16],[80,43]]],0,0]
          ],
          locals: [],
          templates: [child0]
        };
      }());
      var child1 = (function() {
        var child0 = (function() {
          var child0 = (function() {
            return {
              meta: {
                "revision": "Ember@2.9.1",
                "loc": {
                  "source": null,
                  "start": {
                    "line": 97,
                    "column": 10
                  },
                  "end": {
                    "line": 99,
                    "column": 10
                  }
                }
              },
              isEmpty: false,
              arity: 1,
              cachedFragment: null,
              hasRendered: false,
              buildFragment: function buildFragment(dom) {
                var el0 = dom.createDocumentFragment();
                var el1 = dom.createTextNode("            ");
                dom.appendChild(el0, el1);
                var el1 = dom.createElement("option");
                var el2 = dom.createComment("");
                dom.appendChild(el1, el2);
                dom.appendChild(el0, el1);
                var el1 = dom.createTextNode("\n");
                dom.appendChild(el0, el1);
                return el0;
              },
              buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
                var element5 = dom.childAt(fragment, [1]);
                var morphs = new Array(3);
                morphs[0] = dom.createAttrMorph(element5, 'value');
                morphs[1] = dom.createAttrMorph(element5, 'selected');
                morphs[2] = dom.createMorphAt(element5,0,0);
                return morphs;
              },
              statements: [
                ["attribute","value",["get","choice.slug",["loc",[null,[98,28],[98,39]]],0,0,0,0],0,0,0,0],
                ["attribute","selected",["subexpr","eq",[["get","model.fiwarelabConfig.imageName",["loc",[null,[98,56],[98,87]]],0,0,0,0],["get","choice.slug",["loc",[null,[98,88],[98,99]]],0,0,0,0]],[],["loc",[null,[null,null],[98,101]]],0,0],0,0,0,0],
                ["content","choice.name",["loc",[null,[98,102],[98,117]]],0,0,0,0]
              ],
              locals: ["choice"],
              templates: []
            };
          }());
          var child1 = (function() {
            return {
              meta: {
                "revision": "Ember@2.9.1",
                "loc": {
                  "source": null,
                  "start": {
                    "line": 110,
                    "column": 10
                  },
                  "end": {
                    "line": 112,
                    "column": 10
                  }
                }
              },
              isEmpty: false,
              arity: 1,
              cachedFragment: null,
              hasRendered: false,
              buildFragment: function buildFragment(dom) {
                var el0 = dom.createDocumentFragment();
                var el1 = dom.createTextNode("            ");
                dom.appendChild(el0, el1);
                var el1 = dom.createElement("option");
                var el2 = dom.createComment("");
                dom.appendChild(el1, el2);
                dom.appendChild(el0, el1);
                var el1 = dom.createTextNode("\n");
                dom.appendChild(el0, el1);
                return el0;
              },
              buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
                var element4 = dom.childAt(fragment, [1]);
                var morphs = new Array(3);
                morphs[0] = dom.createAttrMorph(element4, 'value');
                morphs[1] = dom.createAttrMorph(element4, 'selected');
                morphs[2] = dom.createMorphAt(element4,0,0);
                return morphs;
              },
              statements: [
                ["attribute","value",["get","choice.name",["loc",[null,[111,28],[111,39]]],0,0,0,0],0,0,0,0],
                ["attribute","selected",["subexpr","eq",[["get","model.fiwarelabConfig.flavorName",["loc",[null,[111,56],[111,88]]],0,0,0,0],["get","choice.name",["loc",[null,[111,89],[111,100]]],0,0,0,0]],[],["loc",[null,[null,null],[111,102]]],0,0],0,0,0,0],
                ["content","choice.name",["loc",[null,[111,103],[111,118]]],0,0,0,0]
              ],
              locals: ["choice"],
              templates: []
            };
          }());
          var child2 = (function() {
            return {
              meta: {
                "revision": "Ember@2.9.1",
                "loc": {
                  "source": null,
                  "start": {
                    "line": 125,
                    "column": 10
                  },
                  "end": {
                    "line": 127,
                    "column": 10
                  }
                }
              },
              isEmpty: false,
              arity: 1,
              cachedFragment: null,
              hasRendered: false,
              buildFragment: function buildFragment(dom) {
                var el0 = dom.createDocumentFragment();
                var el1 = dom.createTextNode("            ");
                dom.appendChild(el0, el1);
                var el1 = dom.createElement("option");
                var el2 = dom.createComment("");
                dom.appendChild(el1, el2);
                dom.appendChild(el0, el1);
                var el1 = dom.createTextNode("\n");
                dom.appendChild(el0, el1);
                return el0;
              },
              buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
                var element3 = dom.childAt(fragment, [1]);
                var morphs = new Array(3);
                morphs[0] = dom.createAttrMorph(element3, 'value');
                morphs[1] = dom.createAttrMorph(element3, 'selected');
                morphs[2] = dom.createMorphAt(element3,0,0);
                return morphs;
              },
              statements: [
                ["attribute","value",["get","choice.name",["loc",[null,[126,28],[126,39]]],0,0,0,0],0,0,0,0],
                ["attribute","selected",["subexpr","eq",[["get","model.fiwarelabConfig.netName",["loc",[null,[126,56],[126,85]]],0,0,0,0],["get","choice.name",["loc",[null,[126,86],[126,97]]],0,0,0,0]],[],["loc",[null,[null,null],[126,99]]],0,0],0,0,0,0],
                ["content","choice.name",["loc",[null,[126,100],[126,115]]],0,0,0,0]
              ],
              locals: ["choice"],
              templates: []
            };
          }());
          var child3 = (function() {
            return {
              meta: {
                "revision": "Ember@2.9.1",
                "loc": {
                  "source": null,
                  "start": {
                    "line": 138,
                    "column": 10
                  },
                  "end": {
                    "line": 140,
                    "column": 10
                  }
                }
              },
              isEmpty: false,
              arity: 1,
              cachedFragment: null,
              hasRendered: false,
              buildFragment: function buildFragment(dom) {
                var el0 = dom.createDocumentFragment();
                var el1 = dom.createTextNode("            ");
                dom.appendChild(el0, el1);
                var el1 = dom.createElement("option");
                var el2 = dom.createComment("");
                dom.appendChild(el1, el2);
                dom.appendChild(el0, el1);
                var el1 = dom.createTextNode("\n");
                dom.appendChild(el0, el1);
                return el0;
              },
              buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
                var element2 = dom.childAt(fragment, [1]);
                var morphs = new Array(3);
                morphs[0] = dom.createAttrMorph(element2, 'value');
                morphs[1] = dom.createAttrMorph(element2, 'selected');
                morphs[2] = dom.createMorphAt(element2,0,0);
                return morphs;
              },
              statements: [
                ["attribute","value",["get","choice.name",["loc",[null,[139,28],[139,39]]],0,0,0,0],0,0,0,0],
                ["attribute","selected",["subexpr","eq",[["get","model.fiwarelabConfig.floatingipPool",["loc",[null,[139,56],[139,92]]],0,0,0,0],["get","choice.name",["loc",[null,[139,93],[139,104]]],0,0,0,0]],[],["loc",[null,[null,null],[139,106]]],0,0],0,0,0,0],
                ["content","choice.name",["loc",[null,[139,107],[139,122]]],0,0,0,0]
              ],
              locals: ["choice"],
              templates: []
            };
          }());
          var child4 = (function() {
            return {
              meta: {
                "revision": "Ember@2.9.1",
                "loc": {
                  "source": null,
                  "start": {
                    "line": 157,
                    "column": 12
                  },
                  "end": {
                    "line": 159,
                    "column": 12
                  }
                }
              },
              isEmpty: false,
              arity: 1,
              cachedFragment: null,
              hasRendered: false,
              buildFragment: function buildFragment(dom) {
                var el0 = dom.createDocumentFragment();
                var el1 = dom.createTextNode("              ");
                dom.appendChild(el0, el1);
                var el1 = dom.createElement("li");
                var el2 = dom.createElement("input");
                dom.setAttribute(el2,"type","checkbox");
                dom.appendChild(el1, el2);
                var el2 = dom.createTextNode(" ");
                dom.appendChild(el1, el2);
                var el2 = dom.createComment("");
                dom.appendChild(el1, el2);
                dom.appendChild(el0, el1);
                var el1 = dom.createTextNode("\n");
                dom.appendChild(el0, el1);
                return el0;
              },
              buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
                var element0 = dom.childAt(fragment, [1]);
                var element1 = dom.childAt(element0, [0]);
                var morphs = new Array(4);
                morphs[0] = dom.createAttrMorph(element1, 'name');
                morphs[1] = dom.createAttrMorph(element1, 'value');
                morphs[2] = dom.createAttrMorph(element1, 'onchange');
                morphs[3] = dom.createMorphAt(element0,2,2);
                return morphs;
              },
              statements: [
                ["attribute","name",["get","choice.name",["loc",[null,[158,48],[158,59]]],0,0,0,0],0,0,0,0],
                ["attribute","value",["get","choice.name",["loc",[null,[158,70],[158,81]]],0,0,0,0],0,0,0,0],
                ["attribute","onchange",["subexpr","action",[["subexpr","action",["secGroupList",["get","choice.name",["loc",[null,[158,125],[158,136]]],0,0,0,0]],[],["loc",[null,[158,102],[158,137]]],0,0]],["value","target.checked"],["loc",[null,[null,null],[158,162]]],0,0],0,0,0,0],
                ["content","choice.name",["loc",[null,[158,164],[158,179]]],0,0,0,0]
              ],
              locals: ["choice"],
              templates: []
            };
          }());
          return {
            meta: {
              "revision": "Ember@2.9.1",
              "loc": {
                "source": null,
                "start": {
                  "line": 83,
                  "column": 4
                },
                "end": {
                  "line": 185,
                  "column": 4
                }
              }
            },
            isEmpty: false,
            arity: 0,
            cachedFragment: null,
            hasRendered: false,
            buildFragment: function buildFragment(dom) {
              var el0 = dom.createDocumentFragment();
              var el1 = dom.createTextNode("    ");
              dom.appendChild(el0, el1);
              var el1 = dom.createComment("");
              dom.appendChild(el0, el1);
              var el1 = dom.createTextNode("\n    ");
              dom.appendChild(el0, el1);
              var el1 = dom.createElement("div");
              dom.setAttribute(el1,"class","over-hr r-mt20 r-mb20");
              var el2 = dom.createTextNode("\n      ");
              dom.appendChild(el1, el2);
              var el2 = dom.createElement("span");
              var el3 = dom.createTextNode("INSTANCE");
              dom.appendChild(el2, el3);
              dom.appendChild(el1, el2);
              var el2 = dom.createTextNode("\n    ");
              dom.appendChild(el1, el2);
              dom.appendChild(el0, el1);
              var el1 = dom.createTextNode("\n\n    ");
              dom.appendChild(el0, el1);
              var el1 = dom.createElement("div");
              dom.setAttribute(el1,"class","row form-group");
              var el2 = dom.createTextNode("\n      ");
              dom.appendChild(el1, el2);
              var el2 = dom.createElement("div");
              dom.setAttribute(el2,"class","col-md-1");
              var el3 = dom.createTextNode("\n        ");
              dom.appendChild(el2, el3);
              var el3 = dom.createElement("div");
              dom.setAttribute(el3,"class","form-label");
              var el4 = dom.createTextNode("\n          ");
              dom.appendChild(el3, el4);
              var el4 = dom.createElement("label");
              dom.setAttribute(el4,"class","form-control-static");
              var el5 = dom.createTextNode("Image*");
              dom.appendChild(el4, el5);
              dom.appendChild(el3, el4);
              var el4 = dom.createTextNode("\n        ");
              dom.appendChild(el3, el4);
              dom.appendChild(el2, el3);
              var el3 = dom.createTextNode("\n      ");
              dom.appendChild(el2, el3);
              dom.appendChild(el1, el2);
              var el2 = dom.createTextNode("\n      ");
              dom.appendChild(el1, el2);
              var el2 = dom.createElement("div");
              dom.setAttribute(el2,"class","col-md-5");
              var el3 = dom.createTextNode("\n        ");
              dom.appendChild(el2, el3);
              var el3 = dom.createElement("select");
              dom.setAttribute(el3,"class","form-control");
              var el4 = dom.createTextNode("\n");
              dom.appendChild(el3, el4);
              var el4 = dom.createComment("");
              dom.appendChild(el3, el4);
              var el4 = dom.createTextNode("        ");
              dom.appendChild(el3, el4);
              dom.appendChild(el2, el3);
              var el3 = dom.createTextNode("\n      ");
              dom.appendChild(el2, el3);
              dom.appendChild(el1, el2);
              var el2 = dom.createTextNode(" \n\n      ");
              dom.appendChild(el1, el2);
              var el2 = dom.createElement("div");
              dom.setAttribute(el2,"class","col-md-1");
              var el3 = dom.createTextNode("\n        ");
              dom.appendChild(el2, el3);
              var el3 = dom.createElement("div");
              dom.setAttribute(el3,"class","form-label");
              var el4 = dom.createTextNode("\n          ");
              dom.appendChild(el3, el4);
              var el4 = dom.createElement("label");
              dom.setAttribute(el4,"class","form-control-static");
              var el5 = dom.createTextNode("Flavor*");
              dom.appendChild(el4, el5);
              dom.appendChild(el3, el4);
              var el4 = dom.createTextNode("\n        ");
              dom.appendChild(el3, el4);
              dom.appendChild(el2, el3);
              var el3 = dom.createTextNode("\n      ");
              dom.appendChild(el2, el3);
              dom.appendChild(el1, el2);
              var el2 = dom.createTextNode("\n      ");
              dom.appendChild(el1, el2);
              var el2 = dom.createElement("div");
              dom.setAttribute(el2,"class","col-md-5");
              var el3 = dom.createTextNode("\n        ");
              dom.appendChild(el2, el3);
              var el3 = dom.createElement("select");
              dom.setAttribute(el3,"class","form-control");
              var el4 = dom.createTextNode("\n");
              dom.appendChild(el3, el4);
              var el4 = dom.createComment("");
              dom.appendChild(el3, el4);
              var el4 = dom.createTextNode("        ");
              dom.appendChild(el3, el4);
              dom.appendChild(el2, el3);
              var el3 = dom.createTextNode("\n      ");
              dom.appendChild(el2, el3);
              dom.appendChild(el1, el2);
              var el2 = dom.createTextNode("\n    ");
              dom.appendChild(el1, el2);
              dom.appendChild(el0, el1);
              var el1 = dom.createTextNode("\n    \n    ");
              dom.appendChild(el0, el1);
              var el1 = dom.createElement("div");
              dom.setAttribute(el1,"class","row form-group");
              var el2 = dom.createTextNode("\n      ");
              dom.appendChild(el1, el2);
              var el2 = dom.createElement("div");
              dom.setAttribute(el2,"class","col-md-1");
              var el3 = dom.createTextNode("\n        ");
              dom.appendChild(el2, el3);
              var el3 = dom.createElement("div");
              dom.setAttribute(el3,"class","form-label");
              var el4 = dom.createTextNode("\n          ");
              dom.appendChild(el3, el4);
              var el4 = dom.createElement("label");
              dom.setAttribute(el4,"class","form-control-static");
              var el5 = dom.createTextNode("Network*");
              dom.appendChild(el4, el5);
              dom.appendChild(el3, el4);
              var el4 = dom.createTextNode("\n        ");
              dom.appendChild(el3, el4);
              dom.appendChild(el2, el3);
              var el3 = dom.createTextNode("\n      ");
              dom.appendChild(el2, el3);
              dom.appendChild(el1, el2);
              var el2 = dom.createTextNode("\n      ");
              dom.appendChild(el1, el2);
              var el2 = dom.createElement("div");
              dom.setAttribute(el2,"class","col-md-5");
              var el3 = dom.createTextNode("\n        ");
              dom.appendChild(el2, el3);
              var el3 = dom.createElement("select");
              dom.setAttribute(el3,"class","form-control");
              var el4 = dom.createTextNode("\n");
              dom.appendChild(el3, el4);
              var el4 = dom.createComment("");
              dom.appendChild(el3, el4);
              var el4 = dom.createTextNode("        ");
              dom.appendChild(el3, el4);
              dom.appendChild(el2, el3);
              var el3 = dom.createTextNode("\n        ");
              dom.appendChild(el2, el3);
              var el3 = dom.createElement("p");
              dom.setAttribute(el3,"class","text-info");
              var el4 = dom.createTextNode("Default: node-int-net-01.");
              dom.appendChild(el3, el4);
              dom.appendChild(el2, el3);
              var el3 = dom.createTextNode("\n      ");
              dom.appendChild(el2, el3);
              dom.appendChild(el1, el2);
              var el2 = dom.createTextNode("\n      ");
              dom.appendChild(el1, el2);
              var el2 = dom.createElement("div");
              dom.setAttribute(el2,"class","col-md-1");
              var el3 = dom.createTextNode("\n        ");
              dom.appendChild(el2, el3);
              var el3 = dom.createElement("div");
              dom.setAttribute(el3,"class","form-label");
              var el4 = dom.createTextNode("\n          ");
              dom.appendChild(el3, el4);
              var el4 = dom.createElement("label");
              dom.setAttribute(el4,"class","form-control-static");
              var el5 = dom.createTextNode("FIP Pool");
              dom.appendChild(el4, el5);
              dom.appendChild(el3, el4);
              var el4 = dom.createTextNode("\n        ");
              dom.appendChild(el3, el4);
              dom.appendChild(el2, el3);
              var el3 = dom.createTextNode("\n      ");
              dom.appendChild(el2, el3);
              dom.appendChild(el1, el2);
              var el2 = dom.createTextNode("\n      ");
              dom.appendChild(el1, el2);
              var el2 = dom.createElement("div");
              dom.setAttribute(el2,"class","col-md-5");
              var el3 = dom.createTextNode("\n        ");
              dom.appendChild(el2, el3);
              var el3 = dom.createElement("select");
              dom.setAttribute(el3,"class","form-control");
              var el4 = dom.createTextNode("\n");
              dom.appendChild(el3, el4);
              var el4 = dom.createComment("");
              dom.appendChild(el3, el4);
              var el4 = dom.createTextNode("        ");
              dom.appendChild(el3, el4);
              dom.appendChild(el2, el3);
              var el3 = dom.createTextNode("\n        ");
              dom.appendChild(el2, el3);
              var el3 = dom.createElement("p");
              dom.setAttribute(el3,"class","text-info");
              var el4 = dom.createTextNode("Default: public-ext-net-01.");
              dom.appendChild(el3, el4);
              dom.appendChild(el2, el3);
              var el3 = dom.createTextNode("\n      ");
              dom.appendChild(el2, el3);
              dom.appendChild(el1, el2);
              var el2 = dom.createTextNode("\n    ");
              dom.appendChild(el1, el2);
              dom.appendChild(el0, el1);
              var el1 = dom.createTextNode("\n\n    ");
              dom.appendChild(el0, el1);
              var el1 = dom.createElement("div");
              dom.setAttribute(el1,"class","row form-group");
              var el2 = dom.createTextNode("\n      ");
              dom.appendChild(el1, el2);
              var el2 = dom.createElement("div");
              dom.setAttribute(el2,"class","col-md-1");
              var el3 = dom.createTextNode("\n        ");
              dom.appendChild(el2, el3);
              var el3 = dom.createElement("div");
              dom.setAttribute(el3,"class","form-label");
              var el4 = dom.createTextNode("\n          ");
              dom.appendChild(el3, el4);
              var el4 = dom.createElement("label");
              dom.setAttribute(el4,"class","form-control-static");
              var el5 = dom.createTextNode("Sec Groups");
              dom.appendChild(el4, el5);
              dom.appendChild(el3, el4);
              var el4 = dom.createTextNode("\n        ");
              dom.appendChild(el3, el4);
              dom.appendChild(el2, el3);
              var el3 = dom.createTextNode("\n      ");
              dom.appendChild(el2, el3);
              dom.appendChild(el1, el2);
              var el2 = dom.createTextNode("\n      ");
              dom.appendChild(el1, el2);
              var el2 = dom.createElement("div");
              dom.setAttribute(el2,"class","col-md-5");
              var el3 = dom.createTextNode("\n      ");
              dom.appendChild(el2, el3);
              var el3 = dom.createElement("div");
              dom.setAttribute(el3,"class","dropdown");
              var el4 = dom.createTextNode("\n        ");
              dom.appendChild(el3, el4);
              var el4 = dom.createElement("button");
              dom.setAttribute(el4,"name","submit");
              dom.setAttribute(el4,"class","form-control button-dropdown text-left");
              var el5 = dom.createComment("");
              dom.appendChild(el4, el5);
              dom.appendChild(el3, el4);
              var el4 = dom.createTextNode("\n        ");
              dom.appendChild(el3, el4);
              var el4 = dom.createElement("div");
              var el5 = dom.createTextNode("\n          ");
              dom.appendChild(el4, el5);
              var el5 = dom.createElement("ul");
              var el6 = dom.createTextNode("\n");
              dom.appendChild(el5, el6);
              var el6 = dom.createComment("");
              dom.appendChild(el5, el6);
              var el6 = dom.createTextNode("          ");
              dom.appendChild(el5, el6);
              dom.appendChild(el4, el5);
              var el5 = dom.createTextNode("\n        ");
              dom.appendChild(el4, el5);
              dom.appendChild(el3, el4);
              var el4 = dom.createTextNode("\n      ");
              dom.appendChild(el3, el4);
              dom.appendChild(el2, el3);
              var el3 = dom.createTextNode("\n        ");
              dom.appendChild(el2, el3);
              var el3 = dom.createElement("p");
              dom.setAttribute(el3,"class","text-info");
              var el4 = dom.createTextNode("Make sure that the port 2376 is open.");
              dom.appendChild(el3, el4);
              dom.appendChild(el2, el3);
              var el3 = dom.createTextNode("\n      ");
              dom.appendChild(el2, el3);
              dom.appendChild(el1, el2);
              var el2 = dom.createTextNode("\n      ");
              dom.appendChild(el1, el2);
              var el2 = dom.createElement("div");
              dom.setAttribute(el2,"class","col-md-1");
              var el3 = dom.createTextNode("\n        ");
              dom.appendChild(el2, el3);
              var el3 = dom.createElement("div");
              dom.setAttribute(el3,"class","form-label");
              var el4 = dom.createTextNode("\n          ");
              dom.appendChild(el3, el4);
              var el4 = dom.createElement("label");
              dom.setAttribute(el4,"class","form-control-static");
              var el5 = dom.createTextNode("SSH user");
              dom.appendChild(el4, el5);
              dom.appendChild(el3, el4);
              var el4 = dom.createTextNode("\n        ");
              dom.appendChild(el3, el4);
              dom.appendChild(el2, el3);
              var el3 = dom.createTextNode("\n      ");
              dom.appendChild(el2, el3);
              dom.appendChild(el1, el2);
              var el2 = dom.createTextNode("\n      ");
              dom.appendChild(el1, el2);
              var el2 = dom.createElement("div");
              dom.setAttribute(el2,"class","col-md-5");
              var el3 = dom.createTextNode("\n        ");
              dom.appendChild(el2, el3);
              var el3 = dom.createComment("");
              dom.appendChild(el2, el3);
              var el3 = dom.createTextNode("\n      ");
              dom.appendChild(el2, el3);
              dom.appendChild(el1, el2);
              var el2 = dom.createTextNode("\n    ");
              dom.appendChild(el1, el2);
              dom.appendChild(el0, el1);
              var el1 = dom.createTextNode("\n\n");
              dom.appendChild(el0, el1);
              var el1 = dom.createTextNode("    ");
              dom.appendChild(el0, el1);
              var el1 = dom.createComment("");
              dom.appendChild(el0, el1);
              var el1 = dom.createTextNode("\n");
              dom.appendChild(el0, el1);
              var el1 = dom.createTextNode("    ");
              dom.appendChild(el0, el1);
              var el1 = dom.createComment("");
              dom.appendChild(el0, el1);
              var el1 = dom.createTextNode("\n\n");
              dom.appendChild(el0, el1);
              var el1 = dom.createTextNode("    ");
              dom.appendChild(el0, el1);
              var el1 = dom.createElement("div");
              dom.setAttribute(el1,"class","footer-actions");
              var el2 = dom.createTextNode("\n      ");
              dom.appendChild(el1, el2);
              var el2 = dom.createElement("button");
              dom.setAttribute(el2,"name","submit");
              dom.setAttribute(el2,"class","btn bg-transparent");
              var el3 = dom.createTextNode("Back");
              dom.appendChild(el2, el3);
              dom.appendChild(el1, el2);
              var el2 = dom.createTextNode("\n      ");
              dom.appendChild(el1, el2);
              var el2 = dom.createElement("button");
              dom.setAttribute(el2,"name","submit");
              dom.setAttribute(el2,"class","btn bg-primary");
              var el3 = dom.createTextNode("Save");
              dom.appendChild(el2, el3);
              dom.appendChild(el1, el2);
              var el2 = dom.createTextNode("\n    ");
              dom.appendChild(el1, el2);
              dom.appendChild(el0, el1);
              var el1 = dom.createTextNode("\n    ");
              dom.appendChild(el0, el1);
              return el0;
            },
            buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
              var element6 = dom.childAt(fragment, [5]);
              var element7 = dom.childAt(element6, [3, 1]);
              var element8 = dom.childAt(element6, [7, 1]);
              var element9 = dom.childAt(fragment, [7]);
              var element10 = dom.childAt(element9, [3, 1]);
              var element11 = dom.childAt(element9, [7, 1]);
              var element12 = dom.childAt(fragment, [9]);
              var element13 = dom.childAt(element12, [3, 1]);
              var element14 = dom.childAt(element13, [1]);
              var element15 = dom.childAt(element13, [3]);
              var element16 = dom.childAt(fragment, [18]);
              var element17 = dom.childAt(element16, [1]);
              var element18 = dom.childAt(element16, [3]);
              var morphs = new Array(18);
              morphs[0] = dom.createMorphAt(fragment,1,1,contextualElement);
              morphs[1] = dom.createAttrMorph(element7, 'onchange');
              morphs[2] = dom.createMorphAt(element7,1,1);
              morphs[3] = dom.createAttrMorph(element8, 'onchange');
              morphs[4] = dom.createMorphAt(element8,1,1);
              morphs[5] = dom.createAttrMorph(element10, 'onchange');
              morphs[6] = dom.createMorphAt(element10,1,1);
              morphs[7] = dom.createAttrMorph(element11, 'onchange');
              morphs[8] = dom.createMorphAt(element11,1,1);
              morphs[9] = dom.createElementMorph(element14);
              morphs[10] = dom.createMorphAt(element14,0,0);
              morphs[11] = dom.createAttrMorph(element15, 'class');
              morphs[12] = dom.createMorphAt(dom.childAt(element15, [1]),1,1);
              morphs[13] = dom.createMorphAt(dom.childAt(element12, [7]),1,1);
              morphs[14] = dom.createMorphAt(fragment,12,12,contextualElement);
              morphs[15] = dom.createMorphAt(fragment,15,15,contextualElement);
              morphs[16] = dom.createElementMorph(element17);
              morphs[17] = dom.createElementMorph(element18);
              return morphs;
            },
            statements: [
              ["inline","partial",["host/add-common"],[],["loc",[null,[84,4],[84,33]]],0,0],
              ["attribute","onchange",["subexpr","action",["selectImage"],["value","target.value"],["loc",[null,[null,null],[96,91]]],0,0],0,0,0,0],
              ["block","each",[["get","fiwareImages",["loc",[null,[97,18],[97,30]]],0,0,0,0]],[],0,null,["loc",[null,[97,10],[99,19]]]],
              ["attribute","onchange",["subexpr","action",[["subexpr","mut",[["get","model.fiwarelabConfig.flavorName",["loc",[null,[109,60],[109,92]]],0,0,0,0]],[],["loc",[null,[109,55],[109,93]]],0,0]],["value","target.value"],["loc",[null,[null,null],[109,116]]],0,0],0,0,0,0],
              ["block","each",[["get","fiwareFlavors",["loc",[null,[110,18],[110,31]]],0,0,0,0]],[],1,null,["loc",[null,[110,10],[112,19]]]],
              ["attribute","onchange",["subexpr","action",[["subexpr","mut",[["get","model.fiwarelabConfig.netName",["loc",[null,[124,60],[124,89]]],0,0,0,0]],[],["loc",[null,[124,55],[124,90]]],0,0]],["value","target.value"],["loc",[null,[null,null],[124,113]]],0,0],0,0,0,0],
              ["block","each",[["get","fiwareNetworks",["loc",[null,[125,18],[125,32]]],0,0,0,0]],[],2,null,["loc",[null,[125,10],[127,19]]]],
              ["attribute","onchange",["subexpr","action",[["subexpr","mut",[["get","model.fiwarelabConfig.floatingipPool",["loc",[null,[137,60],[137,96]]],0,0,0,0]],[],["loc",[null,[137,55],[137,97]]],0,0]],["value","target.value"],["loc",[null,[null,null],[137,120]]],0,0],0,0,0,0],
              ["block","each",[["get","fiwarefippool",["loc",[null,[138,18],[138,31]]],0,0,0,0]],[],3,null,["loc",[null,[138,10],[140,19]]]],
              ["element","action",["toggleVisible"],[],["loc",[null,[154,16],[154,42]]],0,0],
              ["content","model.fiwarelabConfig.secGroups",["loc",[null,[154,104],[154,139]]],0,0,0,0],
              ["attribute","class",["get","toggleSec",["loc",[null,[155,21],[155,30]]],0,0,0,0],0,0,0,0],
              ["block","each",[["get","fiwareSecGroups",["loc",[null,[157,20],[157,35]]],0,0,0,0]],[],4,null,["loc",[null,[157,12],[159,21]]]],
              ["inline","input",[],["type","text","name","sshUser","value",["subexpr","@mut",[["get","model.fiwarelabConfig.sshUser",["loc",[null,[171,49],[171,78]]],0,0,0,0]],[],[],0,0],"classNames","form-control","placeholder","root"],["loc",[null,[171,8],[171,125]]],0,0],
              ["inline","partial",["host/add-options"],[],["loc",[null,[176,4],[176,34]]],0,0],
              ["inline","top-errors",[],["errors",["subexpr","@mut",[["get","errors",["loc",[null,[178,24],[178,30]]],0,0,0,0]],[],[],0,0]],["loc",[null,[178,4],[178,32]]],0,0],
              ["element","action",["back"],[],["loc",[null,[182,14],[182,31]]],0,0],
              ["element","action",["save"],[],["loc",[null,[183,14],[183,31]]],0,0]
            ],
            locals: [],
            templates: [child0, child1, child2, child3, child4]
          };
        }());
        return {
          meta: {
            "revision": "Ember@2.9.1",
            "loc": {
              "source": null,
              "start": {
                "line": 83,
                "column": 4
              },
              "end": {
                "line": 185,
                "column": 4
              }
            }
          },
          isEmpty: false,
          arity: 0,
          cachedFragment: null,
          hasRendered: false,
          buildFragment: function buildFragment(dom) {
            var el0 = dom.createDocumentFragment();
            var el1 = dom.createComment("");
            dom.appendChild(el0, el1);
            return el0;
          },
          buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
            var morphs = new Array(1);
            morphs[0] = dom.createMorphAt(fragment,0,0,contextualElement);
            dom.insertBoundary(fragment, 0);
            dom.insertBoundary(fragment, null);
            return morphs;
          },
          statements: [
            ["block","if",[["get","isStep4",["loc",[null,[83,14],[83,21]]],0,0,0,0]],[],0,null,["loc",[null,[83,4],[185,4]]]]
          ],
          locals: [],
          templates: [child0]
        };
      }());
      return {
        meta: {
          "revision": "Ember@2.9.1",
          "loc": {
            "source": null,
            "start": {
              "line": 58,
              "column": 4
            },
            "end": {
              "line": 185,
              "column": 4
            }
          }
        },
        isEmpty: false,
        arity: 0,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createComment("");
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
          var morphs = new Array(1);
          morphs[0] = dom.createMorphAt(fragment,0,0,contextualElement);
          dom.insertBoundary(fragment, 0);
          dom.insertBoundary(fragment, null);
          return morphs;
        },
        statements: [
          ["block","if",[["get","isStep3",["loc",[null,[58,14],[58,21]]],0,0,0,0]],[],0,1,["loc",[null,[58,4],[185,4]]]]
        ],
        locals: [],
        templates: [child0, child1]
      };
    }());
    return {
      meta: {
        "revision": "Ember@2.9.1",
        "loc": {
          "source": null,
          "start": {
            "line": 33,
            "column": 4
          },
          "end": {
            "line": 185,
            "column": 4
          }
        }
      },
      isEmpty: false,
      arity: 0,
      cachedFragment: null,
      hasRendered: false,
      buildFragment: function buildFragment(dom) {
        var el0 = dom.createDocumentFragment();
        var el1 = dom.createComment("");
        dom.appendChild(el0, el1);
        return el0;
      },
      buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
        var morphs = new Array(1);
        morphs[0] = dom.createMorphAt(fragment,0,0,contextualElement);
        dom.insertBoundary(fragment, 0);
        dom.insertBoundary(fragment, null);
        return morphs;
      },
      statements: [
        ["block","if",[["get","isStep2",["loc",[null,[33,14],[33,21]]],0,0,0,0]],[],0,1,["loc",[null,[33,4],[185,4]]]]
      ],
      locals: [],
      templates: [child0, child1]
    };
  }());
  return {
    meta: {
      "revision": "Ember@2.9.1",
      "loc": {
        "source": null,
        "start": {
          "line": 1,
          "column": 0
        },
        "end": {
          "line": 189,
          "column": 0
        }
      }
    },
    isEmpty: false,
    arity: 0,
    cachedFragment: null,
    hasRendered: false,
    buildFragment: function buildFragment(dom) {
      var el0 = dom.createDocumentFragment();
      var el1 = dom.createElement("section");
      dom.setAttribute(el1,"class","horizontal-form");
      var el2 = dom.createTextNode("\n");
      dom.appendChild(el1, el2);
      var el2 = dom.createElement("form");
      var el3 = dom.createTextNode("\n  ");
      dom.appendChild(el2, el3);
      var el3 = dom.createElement("div");
      dom.setAttribute(el3,"class","container-fluid");
      var el4 = dom.createTextNode("\n");
      dom.appendChild(el3, el4);
      var el4 = dom.createComment("");
      dom.appendChild(el3, el4);
      var el4 = dom.createTextNode("  ");
      dom.appendChild(el3, el4);
      dom.appendChild(el2, el3);
      var el3 = dom.createTextNode("\n");
      dom.appendChild(el2, el3);
      dom.appendChild(el1, el2);
      var el2 = dom.createTextNode("\n");
      dom.appendChild(el1, el2);
      dom.appendChild(el0, el1);
      var el1 = dom.createTextNode("\n");
      dom.appendChild(el0, el1);
      return el0;
    },
    buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
      var morphs = new Array(1);
      morphs[0] = dom.createMorphAt(dom.childAt(fragment, [0, 1, 1]),1,1);
      return morphs;
    },
    statements: [
      ["block","if",[["get","isStep1",["loc",[null,[4,10],[4,17]]],0,0,0,0]],[],0,1,["loc",[null,[4,4],[185,11]]]]
    ],
    locals: [],
    templates: [child0, child1]
  };
}()));;

});
