'use strict';

/////////////////////////////////////////////////////////
///////                 constants                 ///////
/////////////////////////////////////////////////////////

const { transactionFactory, UserIdentity, config, tokensFactory } = require('alastria-identity-lib')
const Log = require('log4js')
const keythereum = require('keythereum')
const configHelper = require('../api/helpers/config.helper')
const myConfig = configHelper.getConfig()
const web3Helper = require('../api/helpers/web3.helper')
const moduleName = '[Entity Model]'
const web3 = web3Helper.getWeb3()
const log = Log.getLogger()
log.level = myConfig.Log.level

let issuerKeystore = myConfig.issuerKeystore
let issuerIdentity, issuerPrivateKey

/////////////////////////////////////////////////////////
///////             PRIVATE FUNCTIONS             ///////
/////////////////////////////////////////////////////////

function getIssuerIdentity() {
  try {
    log.debug(`${moduleName}[${getIssuerIdentity.name}] -----> IN ...`)
    issuerPrivateKey = keythereum.recover(myConfig.addressPassword, issuerKeystore)
    issuerIdentity = new UserIdentity(web3, `0x${issuerKeystore.address}`, issuerPrivateKey)
    log.debug(`${moduleName}[${getIssuerIdentity.name}] -----> Issuer Getted`)
    return issuerIdentity
  } catch (error) {
    log.error(`${moduleName}[${getIssuerIdentity.name}] -----> ${error}`)
    return error
  }
}

function sendSigned(transactionSigned) {
  return new Promise((resolve, reject) => {
    log.debug(`${moduleName}[${sendSigned.name}] -----> IN ...`)
    web3.eth.sendSignedTransaction(transactionSigned)
    .on('transactionHash', function (hash) {
      log.debug(`${moduleName}[${sendSigned.name}] -----> HASH: ${hash}`)
    })
    .on('receipt', receipt => {
      resolve(receipt)
    })
    .on('error', error => {
      log.error(`${moduleName}[${sendSigned.name}] -----> ${error}`)
      reject(error)
    });
  })
}

function subjectGetKnownTransaction(subjectCredential) {
  return new Promise((resolve, reject) => {
    let subjectID = getSubjectIdentity()
    subjectID.getKnownTransaction(subjectCredential)
    .then(receipt => {
      resolve(receipt)
    })
  })
}

function issuerGetKnownTransaction(issuerCredential) {
  return new Promise((resolve, reject) => {
    let issuerID = getIssuerIdentity()
    issuerID.getKnownTransaction(issuerCredential)
    .then(receipt => {
      resolve(receipt)
    })
  })
}

function preparedAlastriaId(subjectAddress) {
  let preparedId = transactionFactory.identityManager.prepareAlastriaID(web3, subjectAddress)
  return preparedId
}

/////////////////////////////////////////////////////////
///////               MODULE EXPORTS              ///////
/////////////////////////////////////////////////////////

module.exports = {
  createAlastriaID,
  addIssuerCredential,
  getCurrentPublicKey,
  getpresentationStatus,
  updateReceiverPresentationStatus,
  addSubjectPresentation,
  getCredentialStatus,
  getSubjectData,
  createAlastriaToken
}

/////////////////////////////////////////////////////////
///////              PUBLIC FUNCTIONS             ///////
/////////////////////////////////////////////////////////

function createAlastriaID(params) {
  return new Promise((resolve, reject) => {
    log.debug(`${moduleName}[${createAlastriaID.name}] -----> IN ...`)
    let subjectAddress = params.address
    let signedCreateTransaction = params.signedTX
    let preparedId = preparedAlastriaId(subjectAddress)
    issuerGetKnownTransaction(preparedId)
    .then(signedPreparedTransaction => {
      sendSigned(signedPreparedTransaction)
      .then(prepareSendSigned => {
        sendSigned(signedCreateTransaction)
        .then(createSendSigned => {
          web3.eth.call({
            to: config.alastriaIdentityManager,
            data: web3.eth.abi.encodeFunctionCall(config.contractsAbi['AlastriaIdentityManager']['identityKeys'], [issuerKeystore.address])
          })
          .then(AlastriaIdentity => {
            let alastriaDID = tokensFactory.tokens.createDID('quor', AlastriaIdentity.slice(26));
            let objectIdentity = {
              proxyAddress: `0x${AlastriaIdentity.slice(26)}`,
              did: alastriaDID
            }
            resolve(objectIdentity)
          })
          .catch(error => {
            log.error(`${moduleName}[${createAlastriaID.name}] -----> ${error}`)
            reject(error)
          })
        })
        .catch(error => {
          log.error(`${moduleName}[${createAlastriaID.name}] -----> ${error}`)
          reject(error)
        })
      })
      .catch(error => {
        log.error(`${moduleName}[${createAlastriaID.name}] -----> ${error}`)
        reject(error)
      })
    })
  })
}

function addIssuerCredential(params) {
  return new Promise((resolve, reject) => {
    log.debug(`${moduleName}[${addIssuerCredential.name}] -----> IN ...`)
    log.debug(`${moduleName}[${addIssuerCredential.name}] -----> Calling addIssuer credential With params: ${JSON.stringify(params)}`)
    let issuerCredential = transactionFactory.credentialRegistry.addIssuerCredential(web3, params.issuerCredentialHash)
    subjectGetKnownTransaction(issuerCredential)
      .then(issuerCredentialSigned => {
        sendSigned(issuerCredentialSigned)
          .then(receipt => {
            let issuerCredentialTransaction = transactionFactory.credentialRegistry.getIssuerCredentialStatus(web3, params.issuer, params.issuerCredentialHash)
            web3.eth.call(issuerCredentialTransaction)
              .then(IssuerCredentialStatus => {
                let result = web3.eth.abi.decodeParameters(["bool", "uint8"], IssuerCredentialStatus)
                let credentialStatus = {
                  "exists": result[0],
                  "status": result[1]
                }
                log.debug(`${moduleName}[${addIssuerCredential.name}] -----> Success`)
                resolve(credentialStatus)
              }).catch(error => {
                log.error(`${moduleName}[${addIssuerCredential.name}] -----> ${error}`)
                reject(error)
              })
          })
          .catch(error => {
            log.error(`${moduleName}[${addIssuerCredential.name}] -----> ${error}`)
            reject(error)
          })
      })
  })
}

function addSubjectPresentation(params) {
  return new Promise((resolve, reject) => {
    log.debug(`${moduleName}[${addSubjectPresentation.name}] -----> IN ...`)
    let subjectPres = transactionFactory.presentationRegistry.addSubjectPresentation(web3, params.subjectPresentationHash, params.uri)
    subjectGetKnownTransaction(subjectPres)
      .then(subjectPresSigned => {
        sendSigned(subjectPresSigned)
          .then(receipt => {
            let subjectPresTx = transactionFactory.presentationRegistry.getSubjectPresentationStatus(web3, params.subject, params.subjectPresentationHash)
            web3.eth.call(subjectPresTx)
              .then(subjectPresStatus => {
                let result = web3.eth.abi.decodeParameters(["bool", "uint8"], subjectPresStatus)
                let credentialStatus = {
                  "exists": result[0],
                  "status": result[1]
                }
                log.debug(`${moduleName}[${addSubjectPresentation.name}] -----> Success`)
                resolve(credentialStatus)
              }).catch(error => {
                log.error(`${moduleName}[${addSubjectPresentation.name}] -----> ${error}`)
                reject(error)
              })
          })
          .catch(error => {
            log.error(`${moduleName}[${addSubjectPresentation.name}] -----> ${error}`)
            reject(error)
          })
      })
  })
}

function getCurrentPublicKey(subject) {
  return new Promise((resolve, reject) => {
    log.debug(`${moduleName}[${getCurrentPublicKey.name}] -----> IN ...`)
    let currentPubKey = transactionFactory.publicKeyRegistry.getCurrentPublicKey(web3, subject)
    web3.eth.call(currentPubKey)
      .then(result => {
        log.debug(`${moduleName}[${getCurrentPublicKey.name}] -----> Success`)
        let pubKey = web3.eth.abi.decodeParameters(['string'], result)
        resolve(pubKey)
      })
      .catch(error => {
        log.error(`${moduleName}[${getCurrentPublicKey.name}] -----> ${error}`)
        reject(error)
      })
  })
}

function getpresentationStatus(presentationHash, issuer, subject) {
  return new Promise((resolve, reject) => {
    log.debug(`${moduleName}[${getpresentationStatus.name}] -----> IN ...`)
    let presentationStatus = null;
    if (issuer != null) {
      presentationStatus = transactionFactory.presentationRegistry.getReceiverPresentationStatus(web3, issuer, presentationHash);
    } else if (subject != null) {
      presentationStatus = transactionFactory.presentationRegistry.getSubjectPresentationStatus(web3, subject, presentationHash);
    }
    if (presentationStatus != null) {
      web3.eth.call(presentationStatus)
        .then(result => {
          let resultStatus = web3.eth.abi.decodeParameters(["bool", "uint8"], result)
          let resultStatusJson = {
            exist: resultStatus[0],
            status: resultStatus[1]
          }
          log.debug(`${moduleName}[${getpresentationStatus.name}] -----> Success`)
          resolve(resultStatusJson);
        })
        .catch(error => {
          log.error(`${moduleName}[${getpresentationStatus.name}] -----> ${error}`)
          reject(error)
        })
    }
  });
}

function updateReceiverPresentationStatus(presentationHash, newStatus) {
  return new Promise((resolve, reject) => {
    log.debug(`${moduleName}[${updateReceiverPresentationStatus.name}] -----> IN ...`)
    let updatepresentationStatus = transactionFactory.presentationRegistry.updateReceiverPresentation(web3, presentationHash, newStatus.newStatus);
    issuerGetKnownTransaction(updatepresentationStatus)
      .then(updatepresentationStatusSigned => {
        sendSigned(updatepresentationStatusSigned)
          .then(receipt => {
            log.debug(`${moduleName}[${updateReceiverPresentationStatus.name}] -----> Success`)
            resolve();
          })
          .catch(error => {
            log.error(`${moduleName}[${updateReceiverPresentationStatus.name}] -----> ${error}`)
            reject(error)
          })
      })
  })
}

function getCredentialStatus(credentialHash, issuer, subject) {
  return new Promise((resolve, reject) => {
    log.debug(`${moduleName}[${getCredentialStatus.name}] -----> IN ...`)
    let credentialStatus = null;
    if (issuer != null) {
      credentialStatus = transactionFactory.credentialRegistry.getIssuerCredentialStatus(web3, issuer, credentialHash);
    } else if (subject != null) {
      credentialStatus = transactionFactory.credentialRegistry.getSubjectCredentialStatus(web3, subject, credentialHash);
    }
    if (credentialStatus != null) {
      web3.eth.call(credentialStatus)
        .then(result => {
          let resultStatus = web3.eth.abi.decodeParameters(["bool", "uint8"], result)
          let resultStatusJson = {
            exist: resultStatus[0],
            status: resultStatus[1]
          }
          log.debug(`${moduleName}[${getCredentialStatus.name}] -----> Success`)
          resolve(resultStatusJson);
        })
        .catch(error => {
          log.error(`${moduleName}[${getCredentialStatus.name}] -----> ${error}`)
          reject(error)
        })
    }
  })
}

function getSubjectData(pubkey, presentationSigned) {
  return new Promise((resolve, reject) => {
    log.debug(`${moduleName}[${getSubjectData.name}] -----> IN ...`)
    let verified = tokensFactory.tokens.verifyJWT(presentationSigned, `04${pubkey.substr(2)}`)
    if (verified == true) {
      log.debug(`${moduleName}[${getSubjectData.name}] -----> Subject presentation verified`)
      let presentationData = tokensFactory.tokens.decodeJWT(presentationSigned)
      if (presentationData.payload) {
        log.debug(`${moduleName}[${getSubjectData.name}] -----> JWT decoded successfuly`)
        resolve(presentationData)
      } else {
        log.error(`${moduleName}[${getSubjectData.name}] -----> Error decoding JWT`)
        reject(presentationData)
      }
    } else {
      log.error(`${moduleName}[${getSubjectData.name}] -----> Error verifying JWT`)
      reject(verified)
    }
  })
}

function createAlastriaToken(at) {
  log.debug(`${moduleName}[${createAlastriaToken.name}] -----> IN ...`)

  let issuerPrivateKey
  try {
    issuerPrivateKey = keythereum.recover(myConfig.addressPassword, myConfig.issuerKeystore)
  } catch (error) {
    log.error(`${moduleName}[${createAlastriaToken.name}] -----> Culdnt get the issuers private key`)
  }
  let alastriaToken = tokensFactory.tokens.createAlastriaToken(at.didIsssuer, at.providerURL, at.callbackURL, 
    at.alastriaNetId, at.tokenExpTime, at.tokenActivationDate, at.jsonTokenId)
  let signedAT = tokensFactory.tokens.signJWT(alastriaToken, issuerPrivateKey)
  log.debug(`${moduleName}[${createAlastriaToken.name}] -----> Success`)
  return signedAT
}
