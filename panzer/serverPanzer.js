var io = require('socket.io').listen(8765);
io.set('log level', 1);

var players = {}; 
var flags = {};
var needsGameStateUpdate = false;
var oldDate = +new Date();

io.sockets.on('connection', function (socket){
	console.log('Player connected: '+socket.id);

	players[socket.id] = new Player(socket);
	flags[socket.id] = new Flag(socket);
	
	console.log('logged: '+socket.id);
	socket.emit('logged', socket.id);

	var sockets = [];
	for (var playerID in players) {
		sockets.push(players[playerID].socket);
	}
	//console.log('Numero de players connectats: '+sockets.length);
	sendGameState(sockets);
	
	socket.on('playerMove', function (pos){//j,i,id, direction
		console.log('S\'ha mogut el player : '+pos.id+' a '+pos.j+','+pos.i+':'+pos.direction);
		players[pos.id].j = pos.j;
		players[pos.id].i = pos.i;
		players[pos.id].id = pos.id;
		players[pos.id].direction = pos.direction;

		for(var playerID in players){
			if(players[playerID].id != pos.id)
				players[playerID].socket.emit('playerMove', pos);
		}
	});
});

function BackgroundTileProperties (props) {
	for (var prop in props) this[prop] = props[prop];
}
BackgroundTileProperties.prototype.fatal = false;
BackgroundTileProperties.prototype.walkable = true;

var BackgroundTiles = [];
BackgroundTiles.push( new BackgroundTileProperties({img:'herba'}) );	//0
BackgroundTiles.push( new BackgroundTileProperties({img:'water', fatal:true}) );	//1
BackgroundTiles.push( new BackgroundTileProperties({img:'terra'}) );	//2
BackgroundTiles.push( new BackgroundTileProperties({img:'herba', walkable:false}) );	//3
BackgroundTiles.push( new BackgroundTileProperties({img:'water', walkable:false}) );	//4

//El mapa tendría que estar rodeado por tiles non-walkable
var backgroundMap = [	[3,3,3,3,3,4,3,3,3,3,3,3],
						[3,0,0,0,0,1,0,0,0,2,2,3],
						[3,0,0,0,0,0,1,0,2,2,0,3],
						[3,0,0,0,0,0,1,0,0,0,0,3],
						[3,0,0,0,0,2,2,1,1,0,0,3],
						[3,0,0,0,0,2,0,0,1,0,0,3],
						[3,0,0,2,0,0,0,0,0,1,1,3],
						[3,0,0,2,2,0,0,0,0,0,0,4],
						[3,0,0,0,0,2,0,0,0,0,0,3],
						[3,0,0,0,0,0,0,0,0,0,0,3],
						[3,3,3,3,3,3,3,3,3,3,3,3]	];

function getRandomMapPos(){
	return {
		i:(Math.floor(Math.random()*(backgroundMap[0].length-2))+1),
		j:(Math.floor(Math.random()*(backgroundMap.length-2))+1)};
}

function mainLoop(){
	var currentDate = +new Date();
	delta = currentDate - oldDate;
	oldDate = currentDate;
	if (delta > 100) delta = 100;

	needsGameStateUpdate = false;

	for (var playerID in players) {
		if (players[playerID].socket.disconnected) players[playerID].disconnect();
		else players[playerID].logic();
	}
	
	if (needsGameStateUpdate) {
		var sockets = [];
		for (var playerID in players) {
			sockets.push(players[playerID].socket);
		}
		sendGameState(sockets);
	}
}

function sendGameState (sockets) {
	var playersPacket = {};
	var flagsPacket = {};
	for (var playerID in players) {
		playersPacket[playerID] = players[playerID].generatePacket();
		flagsPacket[playerID] = flags[playerID].generatePacket();
		//console.log('Players #'+playerID+' - '+players[playerID].id);
	}
	//Envia un emit a tots els sockets connectats
	for (var i = 0; i < sockets.length; ++i) {
		//console.log('Sockets #'+i+' - '+sockets[i].id);
		sockets[i].emit('gameState', {players:playersPacket,flags:flagsPacket});
	}
}
function Flag(socket){
	this.id = socket.id;
	this.socket = socket;
	//console.log('Socket id:'+socket.id);
	this.j = players[this.id].j;
	this.i = players[this.id].i;
	this.untilTick = 1000/1;
}
Flag.prototype = {
	generatePacket: function(){
		var packet = {};
		packet.i = this.i;
		packet.j = this.j;
		packet.id = this.socket.id;
		return packet;
	}
};

function Player(socket){
	this.direction = 'W';
	this.id = socket.id;
	this.j = getRandomMapPos().i;
	this.i = getRandomMapPos().j;
	this.socket = socket;
	this.untilTick = 1000/1;
}
Player.prototype = {
	logic: function(){
		var oldPosition = {i:this.i, j:this.j};
		this.untilTick -= delta;

		if(this.untilTick < 0){
			//console.log('1 seg.');
			this.untilTick = 6000/1;
		}
		var tile = BackgroundTiles[backgroundMap[this.i][this.j]];
		if(!tile.walkable){
			//console.log('j:'+this.j+', i:'+this.i+' bg:'+backgroundMap[this.i][this.j]);
			this.i = oldPosition.i;
			this.j = oldPosition.j;
			console.log('Nop!');
		}else{
			//Comprovar si hi ha player, bandera o mort
			if (oldPosition.i != this.i || oldPosition.j != this.j) {
				if(this.hitTestPlayer()) {
					this.i = oldPosition.i;
					this.j = oldPosition.j;
				}else if (this.hitTestFlag()){
					//spriteContainer.addChild(new PIXI.Text('You win!'));
				}
			}
		}
	},
	hitTestPlayer: function(){
		for(var playerID in players){
			if(players[playerID].id != this.id){
				if(hitTest(this,players[playerID]))	return players[playerID];
			}

		}
	},
	hitTestFlag: function(){
		for(var flagID in flags){
			if(flags[flagID].id != this.id){
				if (hitTest(this, flags[flagID])) {
					win = true;
					spriteContainer.removeChild(flags[flagID].sprite);
					spriteContainer.removeChild(players[flagID].sprite);
					return true;
				}
			}
		}
	},
	disconnect: function () {
		delete players[this.id];
		//console.log('player borrat:'+ this.id);
		//for(var playerID in players) console.log('player restant: '+players[playerID].id);
		needsGameStateUpdate = true;
	},
	generatePacket: function(){
		var packet = {};
		packet.i = this.i;
		packet.j = this.j;
		packet.id = this.socket.id;
		packet.direction = this.direction;
		return packet;dfiudgf
	}

}
setInterval(mainLoop, 1000/60);