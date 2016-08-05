import React, { Component } from 'react';
import googleMapsLoader from 'google-maps'
import aws from 'aws-sdk'
import cognitoHelper from './cognito-helper'
import pokedex from 'pokemon-go-pokedex'
import pogoApi from 'pokemon-go-js-api/src/poke-trackr'

import './App.css';

//open -a Google\ Chrome --args --disable-web-security --user-data-dir=~/Library/Application\ Support/Google/Chrome/Default
//open /Applications/Google\ Chrome.app --args --disable-web-security
const AWS_ACCOUNT_ID = '347971939225'
const AWS_REGION = 'us-east-1'
const COGNITO_IDENTITY_POOL_ID= 'us-east-1:4dccdd09-13e4-4ee6-919a-0886db9faf43'
const UNAUTHENTICATED_ROLE_ARN = 'arn:aws:iam::347971939225:role/Cognito_PokemonGoTrackerUnauthenticated_Role'
const COGNITO_SYNC_DATASET_KEY = 'user_info'

const {updateAwsConfig, getCognitoCredentials} = cognitoHelper({
    awsAccountId: AWS_ACCOUNT_ID,
    awsRegion: AWS_REGION,
    cognitoIdentityPoolId: COGNITO_IDENTITY_POOL_ID,
    unauthenticatedRoleArn: UNAUTHENTICATED_ROLE_ARN,
    cognitoSyncDatasetKey: COGNITO_SYNC_DATASET_KEY
})

AWS.config.update({region:'us-east-1'});

function getPokedexInfo({pokemonId}) {
  return pokedex.pokemon[parseInt(pokemonId) - 1]
}
function getParameterByName(name, url) {
    if (!url) url = window.location.href;
    name = name.replace(/[\[\]]/g, "\\$&");
    var regex = new RegExp("[?&]" + name + "(=([^&#]*)|&|#|$)"),
        results = regex.exec(url);
    if (!results) return null;
    if (!results[2]) return '';
    return decodeURIComponent(results[2].replace(/\+/g, " "));
}
const includeCoordsScanned = getParameterByName('includeCoordsScanned') === 'true'
const numNeighborsPerRequest = getParameterByName('numNeighborsPerRequest') || 3
const numAllowedInflightRequests = getParameterByName('numAllowedInflightRequests') || 15


const username = process.env.PGO_USERNAME || 'pokegosentry3';
const password = process.env.PGO_PASSWORD || 'pokegosentry3';
const provider = process.env.PGO_PROVIDER || 'ptc';

class App extends Component {
  state = {
    numInflightRequests: 0,
    numNeighbours: 22,
    position: {
      // seattle
      lat: 47.6062,
      lng: -122.3321
      // lat: -24.572491,
      // lng: 149.973769
    }
  }
  componentDidMount() {
    updateAwsConfig({
        Logins: {},
        AccountId: AWS_ACCOUNT_ID,
        IdentityPoolId: COGNITO_IDENTITY_POOL_ID,
        RoleArn: UNAUTHENTICATED_ROLE_ARN
    })
    this.setCurrentLocation()
    this.loadGoogleMaps()
    .then(() => {
      getCognitoCredentials().then(() => {
        this.initPokeTracker()
        // this.scanArea(this.state.numNeighbours)
      })
    })
  }

  initPokeTracker() {
    // Moura coverage: -24.572491,149.973769; radius: 22
    // Go to Central Park
    const centerLocation = {
      type: 'coords',
      coords: {
          //moura
          // latitude: -24.572491,
          // longitude: 149.973769
          //
          // olympia
          // latitude: 47.024726,
          // longitude: -122.891396
          //
          // central Park
          // latitude: 40.781217,
          // longitude: -73.963575
          //
          // santa monica pier
          latitude: 34.0081311709505,
          longitude: -118.49679708480834
      }
    }

    const user = pogoApi.getUser({username, password, provider, googleMaps: this.googleMaps})
    user.init({user, centerLocation})
    .then(() => {
      function searchCurrentLocation() {
          return user.searchCurrentLocation({centerLocation})
          .then(({pokemonSightings, pointsOfInterest, neighboringCells}) => {
    console.log(pokemonSightings, pointsOfInterest, neighboringCells)
            const pointsOfInterestMapUrl = getStaticMapUrl({centerLocation, markers: pointsOfInterest})
            const cellsMapUrl = getCellsMapUrl({centerLocation, cells: neighboringCells})
            console.log(cellsMapUrl)
            console.log(pointsOfInterestMapUrl)
          })
      }

      return user.scanForPokemon({centerLocation, numNeighborCells: 10, radius: 3, mapZoomLevel: 13, attemptToCatch: false, searchPokeStops: false, method: 'WALK'})
      .then(({pokemonLocations, pokemonCaught, pokeStopsSearched, itemsAwarded, coordsScanned, cellsScanned}) => {
        const coordMarkers = coordsScanned.map(coord => ({marker: coord}))
          const coordsMapUrl = user.getStaticMapUrl({centerLocation, markers: coordMarkers})
          const pokemonMapUrl = user.getStaticMapUrl({centerLocation, markers: pokemonLocations})
          console.log('pokemonMapUrl')
          console.log(pokemonMapUrl)
          console.log('===================')
          console.log('coordsMapUrl')
          console.log(coordsMapUrl)
          // console.log('===================')
          // console.log('pokemonCaught')
          // console.log(pokemonCaught)
          // console.log('===================')
          // console.log('pokeStopsSearched')
          // console.log(pokeStopsSearched.length)
          // console.log(itemsAwarded)
          // console.log('===================')
          // console.log('num pokemon found:',  pokemonLocations.length)
          // console.log('num cells explored:', coordsScanned.length)
          const pokemonNames = pokemonLocations.map(p => user.getPokedexInfo({pokemonId: p.data.PokedexTypeId}).name).sort()
          console.log(pokemonNames)
      })
      // return searchCurrentLocation()
      // setInterval(searchCurrentLocation, 10000)
    })
    .then(r => {
      console.log(r)
      return r
    })
    .catch(e => {
      console.error('finalerror', e)
    })
  }

  setCurrentLocation() {
    navigator.geolocation.getCurrentPosition((position) => {
      this.updateLocation({
        lat: position.coords.latitude,
        lng: position.coords.longitude
      })
      this.scanArea(this.state.numNeighbours)
    });
  }

  updateLocation({lat, lng}) {
      const position = {lat, lng}
      this.setState({position});
      this.centerGoogleMaps()
      this.scanArea()
  }

  scanArea(numNeighbours) {
    return
    const distanceDelta = 0.0009
    const locationsToScan = []

    for (let x = 0; x < numNeighbours; x += numNeighborsPerRequest) {
      for (let y = 0; y < numNeighbours; y += numNeighborsPerRequest) {
        locationsToScan.push({
          latitude: this.state.position.lat+x*distanceDelta,
          longitude: this.state.position.lng+y*distanceDelta
        })
      }
    }

    const scanLocationActions = locationsToScan.map(locationToScan => {
      return () => this.scan(locationToScan)
    })

    return scanLocationActions.reduce((promise, scanLocation) => promise.then(scanLocation), Promise.resolve())
  }

  scan({latitude, longitude}) {
    const scanPromise = new Promise((resolve, reject) => {
      const retryableScan = () => {
        const lambda = new AWS.Lambda();
        var params = {
          FunctionName: 'PokemonGoTrackr-development', /* required */
          LogType: 'Tail',
          Payload: JSON.stringify({
            includeCoordsScanned,
            radius: numNeighborsPerRequest,
            centerLocation: {
              type: 'coords',
              coords: {latitude, longitude}
            }
          }),
          // Qualifier: '$LATEST'
        };

        this.setState({
          numInflightRequests: this.state.numInflightRequests + 1
        })

        if(this.state.numInflightRequests < numAllowedInflightRequests) {
          resolve()
        }

        lambda.invoke(params, (err, data) => {
          // retry errors
          if (err) {
            return retryableScan()
          }

          const responseData = JSON.parse(data.Payload)

          if(responseData.errorMessage) {
            return retryableScan()
          }
          console.log(responseData.pokemonLocations)
          const pokemonMarkers = responseData.pokemonLocations.map(pokemonLocation => {
            const pokedexInfo = getPokedexInfo({pokemonId: pokemonLocation.data.PokedexTypeId})
            const marker = new google.maps.Marker({
              position: {
                lat: pokemonLocation.data.Latitude,
                lng: pokemonLocation.data.Longitude
              },
              map: this.googleMap,
              title: pokedexInfo.name,
              animation: google.maps.Animation.DROP,
              icon: `http://icons.iconarchive.com/icons/hektakun/pokemon/48/${pokedexInfo.num}-${pokedexInfo.name}-icon.png`//`localhost:3000/image/pokemon/${pokedexInfo.num}.png`
          })

          return marker
        });

        if(includeCoordsScanned) {
          const scanMarkers = responseData.coordsScanned.map(coordLocation => {
            const marker = new google.maps.Marker({
              position: {
                lat: coordLocation.latitude,
                lng: coordLocation.longitude
              },
              map: this.googleMap,
              animation: google.maps.Animation.DROP
          })

          return marker
        });
      }


        this.setState({
          numInflightRequests: this.state.numInflightRequests - 1
        })

        return resolve(responseData)
      })
    }

    retryableScan()
  })

  return scanPromise
  }

  loadGoogleMaps() {
    const googleMapsLoadedPromise = new Promise((resolve, reject) => {
      googleMapsLoader.KEY = 'AIzaSyDhygerdTR0ajzN-28rdVWDli2J4z7lTB0'
      googleMapsLoader.LIBRARIES = ['places']
      googleMapsLoader.load(google => {
        this.googleMaps = google.maps
        const googleMapsLocationInputElement = document.getElementById('googleMapsLocationInput')
        const googleMapsContainerElement = document.getElementById('googleMapsContainer')
        this.locationInput = new google.maps.places.Autocomplete(googleMapsLocationInputElement, {
          types: ['geocode']
        });
        this.googleMap = new google.maps.Map(googleMapsContainerElement, {
          center: this.state.position,
          zoom: 15,
          disableDefaultUI: true,
          zoomControl: true,
          scaleControl: true
        })
        this.locationInput.addListener('place_changed', () => {
          const place = this.locationInput.getPlace()

          if(place.geometry) {
            this.updateLocation({
              lat: place.geometry.location.lat(),
              lng: place.geometry.location.lng()
            })
          }
        })
        // this.googleMap.addListener('center_changed', () => {
        //   // 3 seconds after the center of the map has changed, pan back to the
        //   // marker.
        //   window.setTimeout(() => {
        //     map.panTo(marker.getPosition());
        //   }, 3000);
        // });
        resolve(google)
      })
    })

    return googleMapsLoadedPromise
  }

  centerGoogleMaps() {
    this.googleMap.setCenter(this.state.position)
  }

  render() {
    return (
      <div className="App">
        <div id="googleMapsLocationInputContainer">
          <input id="googleMapsLocationInput"></input>
        </div>
        <div id="googleMapsContainer"></div>
      </div>
    );
  }
}

export default App;
