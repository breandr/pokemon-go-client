import AWS from './aws'
import 'amazon-cognito-js/dist/amazon-cognito.min'

export default function({loginsLocalStorageKey, awsAccountId, awsRegion, cognitoIdentityPoolId, authenticatedRoleArn, cognitoSyncDatasetKey}) {
    return {socialSignIn, hasLocalAuthToken, authenticate, getLogins, removeLogins}

    function updateDataset(dataset, profileData) {
        return new Promise((resolve, reject) => {
            return dataset.getAll((err, records) => {
                let cognitoRecord = Object.assign({
                    id: dataset.getIdentityId()
                }, records)

                const differences = {}

                Object.keys(profileData).forEach(key => {
                    if (profileData[key] !== cognitoRecord[key]) differences[key] = profileData[key]
                })

                // no differences? resolve
                if (!Object.keys(differences).length) {
                    return resolve(cognitoRecord)
                }

                // update differences
                return dataset.putAll(differences, (err, record) => {
                    if (err) {
                        return reject(err)
                    }

                    return dataset.synchronize({
                        onSuccess: (data, newRecords) => resolve(cognitoRecord),
                        onFailure: (err) => reject(err),
                        onConflict: (dataset, conflicts, callback) => {
                            let resolved = conflicts.map((conflict) => {
                                // Take remote version.
                                return conflict.resolveWithRemoteRecord()

                                // Or... take local version.
                                // return conflict.resolveWithLocalRecord()

                                // Or... use custom logic.
                                // var newValue = conflict.getRemoteRecord().getValue() + conflict.getLocalRecord().getValue()
                                // return conflict.resovleWithValue(newValue)

                            })

                            return dataset.resolve(resolved, () => {
                                // TODO: can we just return on resolve?
                                resolve(cognitoRecord)
                                return callback(true)
                            })

                            // Or... callback false to stop the synchronization process.
                            // return callback(false)

                        },
                        onDatasetDeleted: (dataset, datasetName, callback) => {
                            console.log(dataset, datasetName, callback)
                            // Return true to delete the local copy of the dataset.
                            // Return false to handle deleted datasets outsid ethe synchronization callback.
                            // TODO: can we just return on resolve?
                            resolve(cognitoRecord)
                            return callback(true)

                        },
                        onDatasetMerged: (dataset, datasetNames, callback) => {
                            console.log(dataset, datasetNames, callback)
                            // Return true to continue the synchronization process.
                            // Return false to handle dataset merges outside the synchroniziation callback.
                            // TODO: can we just return on resolve?
                            resolve(cognitoRecord)
                            return callback(false)
                        }
                    })
                })
            })
        })
    }

    function getFacebookProvider() {
        return {
            name: 'facebook',
            loginsKey: 'graph.facebook.com',
            login: () => {
                return new Promise((resolve, reject) => {
                    return FB.login((response) => {
                        if (!response.authResponse) {
                            return reject('Problem logging in')
                        }

                        return resolve(response.authResponse.accessToken)
                    })
                })
            },
            getProfile: () => {
                return new Promise((resolve, reject) => {
                    FB.api('/me', (response) => {
                        if (!response) {
                            return reject('No response object')
                        }

                        // FB.api('/me/picture', (pictureResponse) => {
                        //   console.log(pictureResponse.data.url)
                        // })

                        let facebookData = {
                            facebookId: response.id.toString(),
                            givenNames: response.first_name,
                            familyName: response.last_name,
                            gender: response.gender,
                            email: response.email,
                            locale: response.locale,
                            timezone: response.timezone.toString()
                        }

                        return resolve(facebookData)
                    }, {
                        scope: 'public_profile,email'
                    })
                })
            }
        }
    }

    function getGoogleProvider() {
        return {
            name: 'google',
            loginsKey: 'accounts.google.com',
            login: () => {
                return gapi.auth2.getAuthInstance().signIn({
                    scope: 'profile email'
                }).then((response = {error: 'No response object'}) => {
                    if (response.error) {
                        return Promise.reject(response.error)
                    }

                    return response.getAuthResponse().id_token
                })
            },
            getProfile: () => {
                return gapi.client.load('plus', 'v1')
                    .then(() => {
                        return gapi.client.plus.people.get({
                            'userId': 'me'
                        }).then(({result}) => {
                            return {
                                googleId: result.id,
                                givenNames: result.name.givenName,
                                familyName: result.name.familyName,
                                gender: result.gender,
                                email: result.emails.find((email) => email.type === 'account').value,
                                locale: Math.random().toString()//result.language
                            }
                        })
                    })
            }
        }
    }

    function getAmazonProvider() {
        return {
            name: 'amazon',
            loginsKey: 'www.amazon.com',
            login: () => Promise.reject('Amazon not implemented'),
            getProfile: () => Promise.reject('Amazon not implemented')
        }
    }

    function getProvider(providerName) {
        switch (providerName) {
            case 'facebook':
                return getFacebookProvider()
                break
            case 'google':
                return getGoogleProvider()
                break
            case 'amazon':
                return getAmazonProvider()
                break
        }
    }

    function updateAwsConfig({
        Logins
    }) {
        //configure AWS
        return AWS.config.update({
            region: awsRegion,
            credentials: new AWS.CognitoIdentityCredentials({
                Logins,
                AccountId: awsAccountId,
                IdentityPoolId: cognitoIdentityPoolId,
                RoleArn: authenticatedRoleArn
            })
        })
    }

    function getDataset() {
        return new Promise((resolve, reject) => {
            let cognitoSyncClient = new AWS.CognitoSyncManager()

            // get or create data set in local storage
            return cognitoSyncClient.openOrCreateDataset(cognitoSyncDatasetKey, (err, dataset) => {
                if (err) {
                    return reject(err)
                }

                return resolve(dataset)
            })
        })
    }

    function getCognitoCredentials() {
        // get AWS Cognito identity
        return new Promise((resolve, reject) => {
            return AWS.config.credentials.get((err) => {
                if (err) {
                    return reject(err)
                }

                return resolve()
            })
        })
    }

    function socialSignIn(providerName) {
        let provider = getProvider(providerName)

        if (!provider.loginsKey) {
            return Promise.reject(`awsCognito.socialSignIn(): Invalid provider: ${provider}`)
        }

        return provider
            .login()
            .then((accessToken) => {
                let Logins = {
                    [provider.loginsKey]: accessToken
                }

                setLogins(Logins)
                return authenticate().then((dataset) => {
                    return provider
                        .getProfile()
                        .then((profileData) => updateDataset(dataset, profileData))
                })
            })
    }

    function localSignIn() {
    }

    function getLogins() {
        return JSON.parse(localStorage.getItem(loginsLocalStorageKey))
    }

    function setLogins(Logins) {
        localStorage.setItem(loginsLocalStorageKey, JSON.stringify(Logins))
    }

    function removeLogins() {
        localStorage.removeItem(loginsLocalStorageKey)
    }

    function getIdentityId() {
        return localStorage.getItem(`aws.cognito.identity-id.${cognitoIdentityPoolId}`)
    }

    function hasLocalAuthToken() {
        return !!getLogins()
    }

    function authenticate() {
        let Logins = getLogins()

        if (!Logins) {
            return Promise.reject('No Logins')
        }

        updateAwsConfig({
            Logins
        })

        return getCognitoCredentials()
            .then(() => getDataset())
    }
}
