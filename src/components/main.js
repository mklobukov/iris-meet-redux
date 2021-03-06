import React from 'react';
import MainVideo from './main-video';
import MeetToolbar from '../containers/meet-toolbar';
import HorizontalWrapper from './horizontal-wrapper';
import HorizontalBox from '../containers/horizontal-box';
import LoginPanel from '../containers/login-panel';
import { withRouter } from 'react-router';
import withWebRTC, { LocalVideo, RemoteVideo, WebRTCConstants } from 'iris-react-webrtc';
import Config from '../../config.json';
import getQueryParameter from '../utils/query-params';
import validResolution from '../utils/verify-resolution';
import { getRoomId } from '../api/RoomId';
import './style.css'
import VideoControlActions from '../actions/video-control-actions'
import { connect } from 'react-redux'
import { bindActionCreators } from 'redux'
import { loginUserAsync, leaveRoom } from '../actions/user-actions'

const authUrl = Config.authUrl;
const appKey = Config.appKey;

/* NOTE:
Since there are multiple reducers, the shape of the state tree is
{
  reducer1: {...},
  reducer2: {...},
  etc.
}
For this reason, in mapStateToProps(), it is necessary to
specify which reducer manages a particular variable/structure
*/

const mapStateToProps = (state) => {
  return {
    videoIndex: state.videoReducer.videoIndex,
    videoType: state.videoReducer.videoType,
    connection: state.videoReducer.connection,
    userName: state.userReducer.userName,
    routingId: state.userReducer.routingId,
    roomName: state.userReducer.roomName,
    accessToken: state.userReducer.accessToken,
    decodedToken: state.userReducer.decodedToken
  }
}

const mapDispatchToProps = (dispatch, ownProps) => {
  return {
    VideoControl: (videoType, videoIndex, localVideos, remoteVideos) => {
      dispatch(VideoControlActions(videoType, videoIndex,
                                        localVideos, remoteVideos ))
    },
    loginUserAsync: (userName, routingId, roomName, authUrl, appKey) => {
      dispatch(loginUserAsync(userName, routingId, roomName, authUrl, appKey))
    },
    leaveRoom: () => {
      dispatch(leaveRoom())
    }
  }
}

export default connect(mapStateToProps, mapDispatchToProps)(withWebRTC(withRouter(class Main extends React.Component {
  constructor(props) {
    super(props);

    this.state = {
      showRoom: false,
      showUser: false,
      mainVideoConnection: {
        connection: null,
        type: '',
      },
      isVideoMuted: false,
      isVideoBarHidden: false,
      isToolbarHidden: false,
    }

    this.onDominantSpeakerChanged = this._onDominantSpeakerChanged.bind(this);
    this.onLocalVideo = this._onLocalVideo.bind(this);
    this.onRemoteVideo = this._onRemoteVideo.bind(this);
    this.onParticipantLeft = this._onParticipantLeft.bind(this);

    this.timer = setTimeout(() => {
      console.log('inside setTimeOut(), constructor')
      this.setState({
        isToolbarHidden: true,
      });
    }, 10000);
  }

  componentDidMount() {
    //WebRTC Listeners -- not related to Redux store
    this.props.addWebRTCListener(WebRTCConstants.WEB_RTC_ON_DOMINANT_SPEAKER_CHANGED, this.onDominantSpeakerChanged);
    this.props.addWebRTCListener(WebRTCConstants.WEB_RTC_ON_LOCAL_VIDEO, this.onLocalVideo);
    this.props.addWebRTCListener(WebRTCConstants.WEB_RTC_ON_REMOTE_VIDEO, this.onRemoteVideo);
    this.props.addWebRTCListener(WebRTCConstants.WEB_RTC_ON_REMOTE_PARTICIPANT_LEFT, this.onParticipantLeft);

    const requestedResolution = getQueryParameter('resolution');
    console.log(requestedResolution);
    console.log('roomName: ' + this.props.params.roomname);
    let showRoom = false;
    let showUser = false;
    if (this.props.params.roomname === undefined) {
      // no room name specified in URL so show dialog
      // to ask for room name
      showRoom = true;
    }

    const userName = localStorage.getItem('irisMeet.userName');
    if (userName === null) {
      // we do not have user name stored so ask for user name
      showUser = true;
    }

    if (showRoom || showUser) {
      this.setState({
        showRoom,
        showUser,
      });
    } else {
      // we have both userName and roomName so login
      // we should also have routingId but just in case
      // we don't create one
      let routingId = null; //localStorage.getItem('irisMeet.routingId');
      if (routingId === null) {
        routingId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {var r = Math.random()*16|0,v=c=='x'?r:r&0x3|0x8;return v.toString(16);});
        localStorage.setItem('irisMeet.routingId', routingId);
      }
      console.log(this.props.params.roomname)
      this.props.loginUserAsync(userName, routingId, this.props.params.roomname, authUrl, appKey)
    }
  }

componentWillReceiveProps = (nextProps) => {
  //Initially, the accessToken is undefined.
  //It receives a value when the user is logged in
  if (nextProps.accessToken !== this.props.accessToken) {
       this._userLoggedIn();
     }
}

  componentWillUnmount() {
    this.props.removeWebRTCListener(WebRTCConstants.WEB_RTC_ON_DOMINANT_SPEAKER_CHANGED, this.onDominantSpeakerChanged);
    this.props.removeWebRTCListener(WebRTCConstants.WEB_RTC_ON_LOCAL_VIDEO, this.onLocalVideo);
    this.props.removeWebRTCListener(WebRTCConstants.WEB_RTC_ON_REMOTE_VIDEO, this.onRemoteVideo);
    this.props.removeWebRTCListener(WebRTCConstants.WEB_RTC_ON_REMOTE_PARTICIPANT_LEFT, this.onParticipantLeft);
    this.setState({
      showRoom: false,
      showUser: false,
    }, () => {
      this.props.leaveRoom();
    });
  }

  _onLocalVideo(videoInfo) {
    console.log('NUMBER OF LOCAL VIDEOS: ' + this.props.localVideos.length);
    if (this.props.localVideos.length > 0) {
      this.props.VideoControl('local', this.props.localVideos[0].video.index, this.props.localVideos, this.props.remoteVideos)
    }
  }

  _onRemoteVideo(videoInfo) {
    console.log('NUMBER OF REMOTE VIDEOS: ' + this.props.remoteVideos.length);
    if (this.props.remoteVideos.length === 1) {
      this.props.VideoControl('remote', this.props.remoteVideos[0].video.index, this.props.localVideos, this.props.remoteVideos)

    }
  }

  _onParticipantLeft(id) {
    console.log('Remote participant left: ' + id);
    if (this.props.remoteVideos.length === 0) {
      if (this.props.localVideos.length > 0) {
        // no participants so go back to local video
        console.log('Remote participant back to local');
        this.props.VideoControl('local', this.props.localVideos[0].video.index, this.props.localVideos, this.props.remoteVideos)
      }
    }

    if (this.state.mainVideoConnection.connection &&
        this.state.mainVideoConnection.connection.track &&
        this.state.mainVideoConnection.connection.track.getParticipantId() === id) {
      if (this.props.localVideos.length > 0) {
        // if the participant who left was on main screen replace it with local
        // video
        this.props.VideoControl('local', this.props.localVideos[0].video.index, this.props.localVideos, this.props.remoteVideos)
      }
    }
  }

  _onDominantSpeakerChanged(dominantSpeakerEndpoint) {
    console.log('DOMINANT_SPEAKER_CHANGED: ' + dominantSpeakerEndpoint);
    //let participant = track.getParticipantId();
    //let baseId = participant.replace(/(-.*$)|(@.*$)/,'');
      const matchedConnection = this.props.remoteVideos.find((connection) => {
      const participantId = connection.track.getParticipantId();
      console.log('participantId: ' + participantId);
      const endPoint = participantId.substring(participantId.lastIndexOf("/") + 1);
      return endPoint === dominantSpeakerEndpoint;
    });

    console.log('FOUND DOMINANT SPEAKER: ');
    console.log(matchedConnection);
    if (matchedConnection) {
      this.props.VideoControl('remote', matchedConnection.video.index, this.props.localVideos, this.props.remoteVideos)

    } else if (this.props.localVideos.length > 0) {
      // no remote participants found so assume it is local speaker
      this.props.VideoControl('local', this.props.localVideos[0].video.index, this.props.localVideos, this.props.remoteVideos)
    }
  }

_userLoggedIn() {
  this.setState({
    showRoom: false,
    showUser: false,
  }, () => {
    let requestedResolution = getQueryParameter('resolution');
    console.log(requestedResolution);
    if (!validResolution(requestedResolution)) {
      console.log('Requested resolution is not valid.  Switching to default hd.');
      requestedResolution = '640';
    }
    getRoomId(this.props.roomName, this.props.accessToken)
    .then((response) => {
      console.log(response);
      const roomId = response.room_id;
      this.props.initializeWebRTC(this.props.userName, this.props.routingId,
        roomId, this.props.decodedToken.payload['domain'].toLowerCase(),
        {
          eventManagerUrl: Config.eventManagerUrl,
          notificationServer: Config.notificationServer },
          this.props.accessToken,
          '640',
          true,
          true
        );
    })
  });
}


//This is currently done in loginUserAsync()
  _userFailedLogin(error) {
    // TODO: login error handler
    console.log('Login failure: ');
    console.log(error);
  }

  _onLoginPanelComplete(e) {
    e.preventDefault();
    //e.stopPropagation();
    let routingId = null; //localStorage.getItem('irisMeet.routingId');
    if (routingId === null) {
      routingId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {var r = Math.random()*16|0,v=c=='x'?r:r&0x3|0x8;return v.toString(16);});
      localStorage.setItem('irisMeet.routingId', routingId);
    }
    const userName = this.refs.loginpanel.userName ? this.refs.loginpanel.userName : localStorage.getItem('irisMeet.userName');
    const roomName = this.refs.loginpanel.roomName ? this.refs.loginpanel.roomName : this.props.params.roomname;
    localStorage.setItem('irisMeet.userName', userName);
    const hostname = window.location.origin;
    window.location.assign(hostname + '/' + roomName);
  }

  _onLocalAudioMute(isMuted) {
    this.props.onAudioMute();
  }

  _onLocalVideoMute(isMuted) {
    console.log('video muted: ' + isMuted);
    this.setState({
      isVideoMuted: isMuted,
    }, () => {
      this.props.onVideoMute();
    });
  }

  _onExpandHide() {
    this.setState({
      isVideoBarHidden: !this.state.isVideoBarHidden,
    });
  }

  _onMouseMove() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    if (this.state.isToolbarHidden === false) {
      this.timer = setTimeout(() => {
        this.setState({
          isToolbarHidden: true,
        });
      }, 10000);
    } else {
      this.setState({
        isToolbarHidden: false,
      }, () => {
        this.timer = setTimeout(() => {
          this.setState({
            isToolbarHidden: true,
          });
        }, 10000);
      });
    }
  }

  _onHangup() {
    this.props.endSession();
    const hostname = window.location.href;
    const urlString = hostname.substring(0, hostname.lastIndexOf("/"));
    window.location.assign(urlString);
  }

  render() {
    return (
      <div onMouseMove={this._onMouseMove.bind(this)}>
      {this.props.localVideos.length > 0 ?
        <MeetToolbar
          isHidden={this.state.isToolbarHidden}
          onMicrophoneMute={this._onLocalAudioMute.bind(this)}
          onCameraMute={this._onLocalVideoMute.bind(this)}
          onExpandHide={this._onExpandHide.bind(this)}
          onHangup={this._onHangup.bind(this)}
        /> : null}

      <MainVideo>
        {this.props.videoType === 'remote' ?
          <RemoteVideo
            video={this.props.connection.video}
            audio={this.props.connection.audio}
          /> : null
        }
        {this.props.videoType === 'local' ?
          <LocalVideo
            video={this.props.connection.video}
            audio={this.props.connection.audio}
          /> : null
        }
      </MainVideo>
      <HorizontalWrapper isHidden={this.state.isVideoBarHidden}>
          {this.props.localVideos.map((connection) => {
            console.log('LOCAL CONNECTION');
            console.log(connection);
            return (
              <HorizontalBox
                key={connection.video.index}
                type='local'
                id={connection.video.index}
                localVideos = {this.props.localVideos}
                remoteVideos = {this.props.remoteVideos}
              >
                <LocalVideo key={connection.video.index} video={connection.video} audio={connection.audio} />
              </HorizontalBox>
            );
          })}
          {this.props.remoteVideos.map((connection) => {
            console.log('REMOTE CONNECTION');
            console.log(connection);
            console.log(connection.track.getParticipantId());
            if (connection.video) {
              return (
                <HorizontalBox
                  key={connection.video.index}
                  type='remote'
                  id={connection.video.index}
                  localVideos = {this.props.localVideos}
                  remoteVideos = {this.props.remoteVideos}
                >
                  <RemoteVideo key={connection.video.index} video={connection.video} audio={connection.audio} />
                </HorizontalBox>
              );
            }
          })}
      </HorizontalWrapper>
      {this.state.showUser || this.state.showRoom ?
        <LoginPanel
          ref='loginpanel'
          showRoom={this.state.showRoom}
          showUser={this.state.showUser}
          onAction={this._onLoginPanelComplete.bind(this)}
        /> : null}
      </div>
    );
  }
})));
