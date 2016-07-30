import React, { Component } from 'react';
import googleMaps from 'google-maps'
import aws from 'aws-sdk'
import cognitoHelper from './cognito-helper'
import pokedex from 'pokemon-go-pokedex'
import './App.css';

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
const includeCoordsScanned = false
class App extends Component {
  state = {
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
    // this.setCurrentLocation()
    this.loadGoogleMaps()
    getCognitoCredentials().then(() => this.scanArea(this.state.numNeighbours))
  }

  setCurrentLocation() {
    navigator.geolocation.getCurrentPosition((position) => {
      this.updateLocation({
        lat: position.coords.latitude,
        lng: position.coords.longitude
      })
    });
  }

  updateLocation({lat, lng}) {
      const position = {lat, lng}
      this.setState({position});
      this.centerGoogleMaps()
      this.scanArea()
  }

  scanArea(numNeighbours) {
    const distanceDelta = 0.0009
    const locationsToScan = []

    for (let x = 0; x < numNeighbours; ++x) {
      for (let y = 0; y < numNeighbours; ++y) {
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
            radius: 0,
            centerLocation: {
              type: 'coords',
              coords: {latitude, longitude}
            }
          }),
          // Qualifier: '$LATEST'
        };

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

        return resolve(responseData)
      })
    }

    retryableScan()
  })

  return scanPromise
  }

  loadGoogleMaps() {
    googleMaps.KEY = 'AIzaSyDhygerdTR0ajzN-28rdVWDli2J4z7lTB0'
    googleMaps.LIBRARIES = ['places']
    googleMaps.load(google => {
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
    })
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
