import React, { useState, useEffect } from 'react';
import { Music, Plus, List, Settings, Trash2, Edit2, Search, X, LogOut } from 'lucide-react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth, db } from './firebase';
import { collection, addDoc, onSnapshot, deleteDoc, doc, updateDoc, query, orderBy, getDoc } from 'firebase/firestore';
import Auth from './Auth';
import { redirectToSpotifyAuth, getAccessTokenFromUrl, getValidAccessToken, disconnectSpotify, searchTracks, createPlaylist } from './spotify';

export default function WeeklyMusicApp() {
  // Authentication state
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Spotify state
  const [spotifyConnected, setSpotifyConnected] = useState(false);
  const [spotifySearchQuery, setSpotifySearchQuery] = useState('');
  const [spotifyResults, setSpotifyResults] = useState([]);
  const [searchingSpotify, setSearchingSpotify] = useState(false);

  // App state
  const [currentView, setCurrentView] = useState('submit');
  const [songs, setSongs] = useState([]);
  const [userProfile, setUserProfile] = useState(null);
  
  const [newSong, setNewSong] = useState({
    songName: '',
    artist: '',
    platform: 'Spotify',
    link: ''
  });

  const [editingId, setEditingId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Listen for auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Check for Spotify token on mount and after redirect
  useEffect(() => {
    const token = getAccessTokenFromUrl();
    if (token) {
      setSpotifyConnected(true);
    } else {
      const existingToken = getValidAccessToken();
      setSpotifyConnected(!!existingToken);
    }
  }, []);

  // Load user profile
  useEffect(() => {
    if (user) {
      const loadUserProfile = async () => {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          setUserProfile(userDoc.data());
        }
      };
      loadUserProfile();
    }
  }, [user]);

  // Load songs from Firestore in real-time
  useEffect(() => {
    if (!user) return;

    const q = query(collection(db, 'songs'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const songsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setSongs(songsData);
    });

    return () => unsubscribe();
  }, [user]);

  // Logout function
  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error('Error logging out:', err);
    }
  };

  // Spotify search
  const handleSpotifySearch = async () => {
    if (!spotifySearchQuery.trim()) return;
    
    setSearchingSpotify(true);
    try {
      const results = await searchTracks(spotifySearchQuery);
      setSpotifyResults(results);
    } catch (err) {
      console.error('Error searching Spotify:', err);
      alert('Error searching Spotify. Please try connecting again.');
      setSpotifyConnected(false);
    } finally {
      setSearchingSpotify(false);
    }
  };

  // Select song from Spotify search
  const handleSelectSpotifyTrack = (track) => {
    setNewSong({
      songName: track.name,
      artist: track.artists.map(a => a.name).join(', '),
      platform: 'Spotify',
      link: track.external_urls.spotify
    });
    setSpotifyResults([]);
    setSpotifySearchQuery('');
  };

  // Submit song
  const handleSubmit = async () => {
    if (!newSong.songName || !newSong.artist) return;
    
    const today = new Date();
    const weekStart = new Date(today.setDate(today.getDate() - today.getDay()));
    const weekStr = `Week of ${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
    
    try {
      if (editingId) {
        await updateDoc(doc(db, 'songs', editingId), {
          songName: newSong.songName,
          artist: newSong.artist,
          platform: newSong.platform,
          link: newSong.link,
          updatedAt: new Date().toISOString()
        });
        setEditingId(null);
      } else {
        await addDoc(collection(db, 'songs'), {
          user: userProfile?.displayName || user.email,
          userId: user.uid,
          songName: newSong.songName,
          artist: newSong.artist,
          platform: newSong.platform,
          link: newSong.link,
          week: weekStr,
          createdAt: new Date().toISOString()
        });
      }
      
      setNewSong({
        songName: '',
        artist: '',
        platform: 'Spotify',
        link: ''
      });
    } catch (err) {
      console.error('Error saving song:', err);
      alert('Error saving song. Please try again.');
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this song?')) {
      try {
        await deleteDoc(doc(db, 'songs', id));
      } catch (err) {
        console.error('Error deleting song:', err);
        alert('Error deleting song. Please try again.');
      }
    }
  };

  const handleEdit = (song) => {
    setNewSong({
      songName: song.songName,
      artist: song.artist,
      platform: song.platform,
      link: song.link
    });
    setEditingId(song.id);
    setCurrentView('submit');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setNewSong({
      songName: '',
      artist: '',
      platform: 'Spotify',
      link: ''
    });
  };

  const getSongCounts = () => {
    const counts = {};
    songs.forEach(song => {
      counts[song.user] = (counts[song.user] || 0) + 1;
    });
    return counts;
  };

  const filteredSongs = songs.filter(song => 
    song.songName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    song.artist.toLowerCase().includes(searchTerm.toLowerCase()) ||
    song.user.toLowerCase().includes(searchTerm.toLowerCase()) ||
    song.platform.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Handle Spotify connection
  const handleSpotifyConnect = () => {
    redirectToSpotifyAuth();
  };

  const handleSpotifyDisconnect = () => {
    disconnectSpotify();
    setSpotifyConnected(false);
  };

  // Create playlist from current week's songs
  const handleCreatePlaylist = async () => {
    if (!spotifyConnected) {
      alert('Please connect to Spotify first!');
      return;
    }

    const today = new Date();
    const weekStart = new Date(today.setDate(today.getDate() - today.getDay()));
    const weekStr = `Week of ${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

    const weekSongs = songs.filter(song => song.week === weekStr && song.platform === 'Spotify' && song.link);
    
    if (weekSongs.length === 0) {
      alert('No Spotify songs for this week yet!');
      return;
    }

    try {
      const trackUris = weekSongs
        .map(song => {
          const match = song.link.match(/track\/([a-zA-Z0-9]+)/);
          return match ? `spotify:track:${match[1]}` : null;
        })
        .filter(uri => uri !== null);

      const playlist = await createPlaylist(
        `Weekly Tunes - ${weekStr}`,
        `Collaborative playlist created by the Weekly Tunes group`,
        trackUris
      );

      alert(`Playlist created successfully! Check your Spotify account.`);
      window.open(playlist.external_urls.spotify, '_blank');
    } catch (err) {
      console.error('Error creating playlist:', err);
      alert('Error creating playlist. Please try again.');
    }
  };

  const renderSubmitView = () => (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-2xl font-bold mb-4 text-gray-800">
          {editingId ? 'Edit Song' : 'Submit Your Weekly Pick'}
        </h2>
        {editingId && (
          <div className="mb-4 p-3 bg-blue-50 rounded-lg flex items-center justify-between">
            <span className="text-sm text-blue-800">Editing mode - make your changes below</span>
            <button 
              onClick={cancelEdit}
              className="text-blue-600 hover:text-blue-800 text-sm font-medium"
            >
              Cancel Edit
            </button>
          </div>
        )}

        {/* Spotify Search */}
        {spotifyConnected && !editingId && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
            <h3 className="text-sm font-semibold text-gray-800 mb-2">Search Spotify</h3>
            <div className="flex gap-2">
              <input
                type="text"
                value={spotifySearchQuery}
                onChange={(e) => setSpotifySearchQuery(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSpotifySearch()}
                placeholder="Search for a song..."
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
              />
              <button
                onClick={handleSpotifySearch}
                disabled={searchingSpotify}
                className="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 transition-colors disabled:bg-gray-300"
              >
                {searchingSpotify ? 'Searching...' : 'Search'}
              </button>
            </div>

            {spotifyResults.length > 0 && (
              <div className="mt-3 max-h-60 overflow-y-auto space-y-2">
                {spotifyResults.map((track) => (
                  <div
                    key={track.id}
                    onClick={() => handleSelectSpotifyTrack(track)}
                    className="p-3 bg-white border border-gray-200 rounded-md hover:bg-gray-50 cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      {track.album.images[2] && (
                        <img src={track.album.images[2].url} alt="" className="w-10 h-10 rounded" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm text-gray-900 truncate">{track.name}</p>
                        <p className="text-xs text-gray-600 truncate">
                          {track.artists.map(a => a.name).join(', ')}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Song Name
            </label>
            <input
              type="text"
              value={newSong.songName}
              onChange={(e) => setNewSong({...newSong, songName: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter song name"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Artist
            </label>
            <input
              type="text"
              value={newSong.artist}
              onChange={(e) => setNewSong({...newSong, artist: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter artist name"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Platform
            </label>
            <select
              value={newSong.platform}
              onChange={(e) => setNewSong({...newSong, platform: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option>Spotify</option>
              <option>Apple Music</option>
              <option>YouTube Music</option>
              <option>Deezer</option>
              <option>SoundCloud</option>
              <option>Other</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Song Link (Optional)
            </label>
            <input
              type="url"
              value={newSong.link}
              onChange={(e) => setNewSong({...newSong, link: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Paste link to song"
            />
          </div>
          
          <button
            onClick={handleSubmit}
            disabled={!newSong.songName || !newSong.artist}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors font-medium disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            {editingId ? 'Update Song' : 'Submit Song'}
          </button>
        </div>
      </div>
    </div>
  );

  const renderFeedView = () => {
    const songCounts = getSongCounts();
    
    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-md p-6 mb-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-gray-800">Weekly Picks Feed</h2>
            <div className="text-sm text-gray-600">
              {songs.length} {songs.length === 1 ? 'song' : 'songs'} total
            </div>
          </div>

          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by song, artist, user, or platform..."
                className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>
          </div>

          {Object.keys(songCounts).length > 0 && (
            <div className="mb-4 p-3 bg-gray-50 rounded-lg">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Submissions by User</h3>
              <div className="flex flex-wrap gap-2">
                {Object.entries(songCounts).map(([user, count]) => (
                  <div key={user} className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm">
                    {user}: {count}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="bg-white rounded-lg shadow-md p-6">
          {filteredSongs.length === 0 ? (
            <p className="text-gray-500 text-center py-8">
              {searchTerm ? 'No songs match your search.' : 'No songs submitted yet. Be the first!'}
            </p>
          ) : (
            <div className="space-y-4">
              {filteredSongs.map((song) => (
                <div key={song.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Music className="w-4 h-4 text-blue-600" />
                        <span className="font-semibold text-gray-900">{song.songName}</span>
                      </div>
                      <p className="text-gray-600 text-sm mb-1">by {song.artist}</p>
                      <div className="flex items-center gap-3 text-xs text-gray-500">
                        <span>Submitted by {song.user}</span>
                        <span>•</span>
                        <span>{song.platform}</span>
                        <span>•</span>
                        <span>{song.week}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      {song.link && (
                        <a
                          href={song.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                        >
                          Listen
                        </a>
                      )}
                      {song.userId === user.uid && (
                        <>
                          <button
                            onClick={() => handleEdit(song)}
                            className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                            title="Edit song"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(song.id)}
                            className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                            title="Delete song"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderConnectView = () => (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-2xl font-bold mb-4 text-gray-800">Connect Streaming Services</h2>
        <p className="text-gray-600 mb-6">
          Connect your streaming services to search songs and create playlists automatically.
        </p>
        
        <div className="space-y-3">
          <div className="border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center">
                  <Music className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Spotify</h3>
                  <p className="text-sm text-gray-500">
                    {spotifyConnected ? 'Connected' : 'Not connected'}
                  </p>
                </div>
              </div>
              {spotifyConnected ? (
                <button 
                  onClick={handleSpotifyDisconnect}
                  className="bg-red-500 text-white px-4 py-2 rounded-md hover:bg-red-600 transition-colors text-sm font-medium"
                >
                  Disconnect
                </button>
              ) : (
                <button 
                  onClick={handleSpotifyConnect}
                  className="bg-green-500 text-white px-4 py-2 rounded-md hover:bg-green-600 transition-colors text-sm font-medium"
                >
                  Connect
                </button>
              )}
            </div>
            
            {spotifyConnected && (
              <div className="mt-3 pt-3 border-t border-gray-200">
                <button
                  onClick={handleCreatePlaylist}
                  className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors text-sm font-medium"
                >
                  Create Playlist from This Week's Songs
                </button>
                <p className="text-xs text-gray-500 mt-2">
                  This will create a Spotify playlist with all Spotify songs from the current week
                </p>
              </div>
            )}
          </div>
          
          <div className="border border-gray-200 rounded-lg p-4 flex items-center justify-between opacity-50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-pink-500 rounded-full flex items-center justify-center">
                <Music className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Apple Music</h3>
                <p className="text-sm text-gray-500">Coming soon</p>
              </div>
            </div>
          </div>
          
          <div className="border border-gray-200 rounded-lg p-4 flex items-center justify-between opacity-50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-500 rounded-full flex items-center justify-center">
                <Music className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">YouTube Music</h3>
                <p className="text-sm text-gray-500">Coming soon</p>
              </div>
            </div>
          </div>
        </div>
        
        <div className="mt-6 p-4 bg-blue-50 rounded-lg">
          <h4 className="font-semibold text-gray-900 mb-2">✨ Spotify Connected!</h4>
          <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside">
            <li>Search Spotify's library when submitting songs</li>
            <li>Auto-fill song details from search results</li>
            <li>Create collaborative playlists from weekly picks</li>
          </ul>
        </div>
      </div>
    </div>
  );

  // Show loading while checking authentication
  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-xl text-gray-600">Loading...</div>
      </div>
    );
  }

  // Show Auth component if not logged in
  if (!user) {
    return <Auth onLogin={() => {}} />;
  }

  // Main app (only shown when logged in)
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-8">
        <header className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Music className="w-8 h-8 text-blue-600" />
            <h1 className="text-4xl font-bold text-gray-900">Weekly Tunes</h1>
          </div>
          <p className="text-gray-600">Share your favorite songs with friends every Sunday</p>
          <div className="mt-3 flex items-center justify-center gap-3">
            <span className="text-sm text-gray-600">
              Logged in as: {userProfile?.displayName || user.email}
            </span>
            <button
              onClick={handleLogout}
              className="inline-flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors text-sm"
            >
              <LogOut className="w-4 h-4" />
              Logout
            </button>
          </div>
        </header>

        <nav className="flex justify-center gap-2 mb-8">
          <button
            onClick={() => setCurrentView('submit')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
              currentView === 'submit'
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            <Plus className="w-4 h-4" />
            Submit
          </button>
          <button
            onClick={() => setCurrentView('feed')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
              currentView === 'feed'
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            <List className="w-4 h-4" />
            Feed
          </button>
          <button
            onClick={() => setCurrentView('connect')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
              currentView === 'connect'
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            <Settings className="w-4 h-4" />
            Connect
          </button>
        </nav>

        <main>
          {currentView === 'submit' && renderSubmitView()}
          {currentView === 'feed' && renderFeedView()}
          {currentView === 'connect' && renderConnectView()}
        </main>
      </div>
    </div>
  );
}