var io = require('socket.io').listen(8765);
io.set('log level', 1);

var players = {}; 
var flags = {};
var needsGameStateUpdate = false;

io.sockets.on('connection', function (socket){
	console.log('Player connected: '+socket.id);

	players[socket.id] = new Player(socket);
	flags[socket.id] = new Flag(socket);
	
	socket.emit('logged', socket.id);

	socket.on('playerMove', function (pos){
		console.log('playermove id:'+players[socket.id].id+' j:'+players[socket.id].j+' - i:'+players[socket.id].i);
		players[socket.id].i = pos.i;
		players[socket.id].j = pos.j;
		var sockets = [];
		for (var playerID in players) {
			sockets.push(players[playerID].socket);
		}
		sendGameState(sockets);
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
	console.log('bgl: '+(backgroundMap.length-2));
	console.log('bg0l: '+(backgroundMap[0].length-2));
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

	requestAnimationFrame(mainLoop);
	renderer.render(stage);
}

function sendGameState (sockets) {
	var playersPacket = {};
	for (var playerID in players) {
		playersPacket[playerID] = players[playerID].generatePacket();
	}
	//Envia un emit a tots els sockets connectats
	for (var i = 0; i < sockets.length; ++i) {
		console.log('Sockets #'+i+' - '+sockets.id);
		sockets[i].emit('gameState', {players:playersPacket});
	}
}
function Flag(socket){
	this.id = socket.id;
	this.socket = socket;
	console.log('arnau'+socket.id);
	this.j = players[this.id].j;
	this.i = players[this.id].i;
	console.log(this.i);
	this.untilTick = 1000/1;
}
Flag.prototype = {
	
};

function Player(socket){
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

		if (keyboard.keysCHAR['W'] && !oldKeysCHAR['W']) this.i -= 1;
		if (keyboard.keysCHAR['S'] && !oldKeysCHAR['S']) this.i += 1;
		if (keyboard.keysCHAR['D'] && !oldKeysCHAR['D']) this.j += 1;
		if (keyboard.keysCHAR['A'] && !oldKeysCHAR['A']) this.j -= 1;

		if(this.untilTick < 0){
			console.log('1 seg.');
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
					spriteContainer.addChild(new PIXI.Text('You win!'));
				}
			}
		}
		var pos = posForIndex(this.i,this.j);
		this.sprite.position.x += (pos.x-this.sprite.position.x)/5;
		this.sprite.position.y += (pos.y-this.sprite.position.y)/5;
	},
	hitTestPlayer: function(){
		for(playerID in players){
			if(players[playerID].id != this.id){
				if(hitTest(this,players[playerID]))	return players[playerID];
			}

		}
	},
	hitTestFlag: function(){
		for(flagID in flags){
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
		delete players[this.socket.id];
		needsGameStateUpdate = true;
	},
	generatePacket: function(){
		var packet = {};
		packet.i = this.x;
		packet.j = this.y;
		packet.id = this.socket.id;
		return packet;
	}

}