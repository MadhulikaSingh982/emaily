const mongoose = require('mongoose');
const _ = require('lodash');
const {Path} = require('path-parser');
const {URL} = require('url');
const requireLogin = require('../middlewares/requireLogin');
const requireCredits = require('../middlewares/requireCredits');
const Mailer = require('../services/Mailer');
const surveyTemplate = require('../services/emailTemplates/surveyTemplate');
const Survey = mongoose.model('surveys');

module.exports = app => {

    app.get('/api/surveys', requireLogin, async (req, res) => {
        const surveys = await Survey.find({ _user: req.user.id })
            .select({recepients: false});
        res.send(surveys);
    });

    app.get('/api/surveys/thanks', (req, res) => {
        res.send('Thanks for voting');
    });

    app.post('/api/surveys/webhooks', (req, res) => {
        const p = new Path('/api/surveys/:surveyId/:choice');
        _.chain(req.body)
            .map(({email, url}) => {
                const match = p.test(new URL(url).pathname);
                if(match) {
                    return {email, surveyId: match.surveyId, choice: match.choice};
                }
            })
            .compact()
            .uniqBy('email', 'surveyId')
            .each(({surveyId, email, choice})=> {
                Survey.updateOne({
                    _id: surveyId,
                    recepients: {
                        $elemMatch: { email: email, responded: false }
                    }
                }, {
                    $inc: { [choice] : 1},
                    $set: { 'recepients.$.responded': true},
                    lastResponded: new date()
                }).exec();
            })
            .value();

        res.send({});
    });

    app.post('/api/surveys', requireLogin, requireCredits, async (req, res) => { 
        const { title, subject, body, recepients} = req.body;

        const survey = new Survey({
            title,
            subject,
            body,
            recepients: recepients.split(',').map(email => ({ email: email.trim() })),
            _user: req.user.id,
            dateSent: Date.now()
        });

        // Greate place to send an email !
        const mailer = new Mailer(survey, surveyTemplate(survey));

        try{
            await mailer.send();
            await survey.save();
            req.user.credits -=1;
            const user = await req.user.save();
    
            res.send(user);
        } catch (err) {
            res.status(422).send(err);
        }

    });
}; 