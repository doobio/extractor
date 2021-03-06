var https = require('https'),
	models = require('./models'),
	constants = require('./constants'),
	Range = require('./helper').Range,
	USER_ID = 11121738,
	CLIENT_ID = constants.CLIENT_ID,
	CLIENT_SERCRET = constants.CLIENT_SERCRETs,
	apiUri = 'https://api.soundcloud.com/',
	clientIdQuery = '.json?client_id=' + CLIENT_ID + '&offset=', 
	nodeCount = 1, 
	nodesLeft = 0, 
	next,
	_offset, 
	rule,
	range;

console.log('child: %s', process.pid);

require('colors').setTheme({
	silly: 'rainbow',
	input: 'grey',
	verbose: 'cyan',
	prompt: 'grey',
	info: 'green',
	data: 'grey',
	help: 'cyan',
	warn: 'yellow',
	debug: 'blue',
	error: 'red'
});

process.on('message', init); 

range = new Range();

var extractors = {
	trackExtractor: trackExtractor
};

function init (message) {

	rule = message;
	next = (function(_t){
		var tick = 0;
		return function() {
			return (tick += _t);
		};
	}(rule.tick));	

	models.ready(function(){

		_offset = rule.offset;
		nodeCount = rule.nodeCount;
		extract();	
	});
};

function extract() {
	var query = rule.query;
	console.log('rule %s, extract next %s nodes'.verbose, rule.id, rule.nodesLeft);

	models.User.find(query)
	.limit(rule.limit)
	.exec(function(error, docs){
		
		if (error) throw error;
		
		if (!docs || docs.length == 0) {

			rule.finished = true;
			return finish()
		}

		nodesLeft = docs.length;

		range.set(0, docs.length, docs.length);

		for (var i = 0; i < docs.length; ++i) {

			

			// for (var j in rule.updates)
			// 	docs[i][j] = rule.updates[j];


			(function(i){
					
				setTimeout(function(){
					
					extractors[rule.extractor](0, docs[i], nodeCount);
					nodeCount++;

				}, next());

			}(i));
		}
	});
};

function trackExtractor(offset, node, index) {

	if (offset == 0) console.log('tracks %s %s'.input, nodeCount.toString().info, node.username);

	var path = node.uri + '/tracks' + clientIdQuery + offset
	
	https.get(path, function(res) {

		var _data = '';

		if (res.statusCode != 200) console.log((res.statusCode.toString()).error)
		
		res.on('data', function (chunck) {
			_data += chunck.toString('utf8');
		});

		res.on('end', function () {
			
			var data = JSON.parse(_data);

			_data = null;
			global.gc();

			for (var i = 0; i < data.length; ++i) {

				for (var j in data[i]) {
					if (data[i][j] == null) delete data[i][j];
				}
							
				if (node.tracks.indexOf(data[i].id) == -1) node.tracks.push(data[i].id);

				range.increment()
				setTimeout(function(){
					range.increment(-1);
				}, 150);
				// models.Track.create(data[i], function(error){
				// 	if (error) throw error;
				// });
		
			};

			offset = offset == 0 ? 51 : offset + 50;
			data = null;
			global.gc();

			if (offset > node.track_count || offset > 8000) {

				--nodesLeft;				

				// node.tracksStatus = 2;
				// node.save(function(error){
				// 	if (error) throw error;
				// 	console.log('Fin %s %s. %s node left...', node.username, index.toString().info, nodesLeft.toString().info);
				
				// 	if (nodesLeft == 0) {
				// 		finish();
				// 	}
				// 	node = null;
				// 	return;
				// });
				setTimeout(function(){
						// console.log('about to change');
					range.increment(-1);
				}, 150);

			}
			else
				trackExtractor(offset, node, index);

		});

	}).on('error', function(e) {
		console.log("Got error: " + e.message);
		return callback(error);
	});
};

function finish () {	
	
	rule.offset = rule.offset + 50;
	rule.nodeCount = nodeCount;

	setTimeout(function(){
		process.send(rule);
	}, 1000);
	global.gc();
};

range.on('set', function(l, u, v){
	console.log('Set lower: %s upper: %s value: %s'.verbose, l, u, v);
});

range.on('change', function(value){
	console.log('new value: %s'.input, value);
});

range.on('lower', function(){
	console.log('finished'.info);
	rule.finished = true;
	process.send(rule);
});


global.gc();


