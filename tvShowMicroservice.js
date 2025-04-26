const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const { Kafka } = require('kafkajs');
const mongoose = require('mongoose');

mongoose.connect('mongodb://localhost:27017/tvshowsDB', { 
    useNewUrlParser: true, 
    useUnifiedTopology: true 
});

const TVShow = mongoose.model('TVShow', {
    title: String,
    description: String
});

const kafka = new Kafka({
    clientId: 'tvshow-service',
    brokers: ['localhost:9092']
});

const tvShowProtoPath = './tvShow.proto';
const tvShowProtoDefinition = protoLoader.loadSync(tvShowProtoPath, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true
});
const tvShowProto = grpc.loadPackageDefinition(tvShowProtoDefinition).tvShow;

const tvShowService = {
    GetTVShow: async (call, callback) => {
        try {
            const tvShow = await TVShow.findById(call.request.tv_show_id);
            callback(null, { tv_show: tvShow });
        } catch (err) {
            callback(err);
        }
    },

    SearchTVShows: async (call, callback) => {
        try {
            const tvShows = await TVShow.find({ title: { $regex: call.request.query } });
            callback(null, { tv_shows: tvShows });
        } catch (err) {
            callback(err);
        }
    },

    CreateTVShow: async (call, callback) => {
        const { title, description } = call.request;
        const tvShow = new TVShow({ title, description });
        
        try {
            const savedTVShow = await tvShow.save();
            
            const producer = kafka.producer();
            await producer.connect();
            await producer.send({
                topic: 'tvshows_topic',
                messages: [{ value: JSON.stringify(savedTVShow) }]
            });
            
            callback(null, { tv_show: savedTVShow });
        } catch (err) {
            callback(err);
        }
    }
};

const server = new grpc.Server();
server.addService(tvShowProto.TVShowService.service, tvShowService);
server.bindAsync('0.0.0.0:50052', grpc.ServerCredentials.createInsecure(), () => {
    server.start();
    console.log('TVShow Service running on port 50052');
});

const consumer = kafka.consumer({ groupId: 'tvshow-group' });
consumer.connect()
    .then(() => consumer.subscribe({ topic: 'movies_topic' }))
    .then(() => consumer.run({
        eachMessage: async ({ message }) => {
            console.log('[TVShow Service] Received Movie event:', message.value.toString());
        }
    }));