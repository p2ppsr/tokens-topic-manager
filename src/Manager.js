const bsv = require('babbage-bsv')
const pushdrop = require('pushdrop')

/** Token Protocol fields
0=<pubkey>
1=OP_CHECKSIG
2=amount
3=A signature from the field 0 public key over field 2
Above 3=OP_DROP / OP_2DROP — Drop fields 2-3 from the stack.**/

class TokenManager {


  /**
   * @constructor
   * @param {Object} obj all params given in an object
   * @param {Array<Object>} obj.issuanceTXID TXID of the transaction whose first output seeds the token with its supply.
   */
  constructor ({ issuanceTXID } = {}) {
    this.issuanceTXID = issuanceTXID
  }

  /**
   * Returns the outputs from the transaction that are admissible.
   * @param {Object} obj all params given in an object
   * @param {Array<Object>} obj.previousUTXOs Former members of the overlay spent by this transaction
   * @param {Object} obj.parsedTransaction transaction containing outputs to admit into the current topic
   * @returns
   */
  identifyAdmissibleOutputs ({ previousUTXOs, parsedTransaction }) {
    try {
      // Validate params
      if (!Array.isArray(parsedTransaction.inputs) || parsedTransaction.inputs.length < 1) {
        const e = new Error('An array of transaction inputs is required!')
        e.code = 'ERR_TX_INPUTS_REQUIRED'
        throw e
      }
      if (!Array.isArray(parsedTransaction.outputs) || parsedTransaction.outputs.length < 1) {
        const e = new Error('Transaction outputs must be included as an array!')
        e.code = 'ERR_TX_OUTPUTS_REQUIRED'
        throw e
      }

      // Allow the issuance transaction.
      console.log(`${parsedTransaction.txid} === ${this.issuanceTXID}`)
      if (parsedTransaction.txid === this.issuanceTXID) {
        console.log('Admitting issuance TXID')
        return [0]
      }

      // Total the tokens being spent by this transaction.
      let maxTokens = 0
      for (const utxo of previousUTXOs) {
        console.log(utxo)
        const tokenPayload = pushdrop.decode({
          script: utxo.outputScript.toString('hex'),
          fieldFormat: 'utf8'
        })
        maxTokens += Number(tokenPayload.fields[0])
      }
      console.log(`max tokens: ${maxTokens}`)

      const outputs = []
      let totalTokensAdded = 0

      // Try to decode and validate transaction outputs
      for (const [i, output] of parsedTransaction.outputs.entries()) {
        // Decode the TSP account fields
        try {
          const result = pushdrop.decode({
            script: output.script.toHex(),
            fieldFormat: 'buffer'
          })

          /// Extract the amount of the token from the output and make sure it's at least 1
          const outputTokenAmount = Number(result.fields[0].toString('utf8'))
          if (outputTokenAmount < 1) {
            throw new Error('Output token amount cannot be less than 1')
          }

          // Add the output's token amount to the transaction's total and append the output to the list
          totalTokensAdded += outputTokenAmount
          outputs.push(i)
        } catch (error) {
          // Probably not a PushDrop token so do nothing
          console.log(error)
        }
      }

      console.log(`Total tokens: ${totalTokensAdded}`)

      // The transaction is invalid if the outputs total to more than what the inputs unlocked (in terms of token amounts)
      if (totalTokensAdded > maxTokens) {
        throw new Error('Transaction output token amounts exceed inputs redeemed!')
      }
      
      // Returns an array of output numbers
      return outputs
    } catch (error) {
      console.error(error)
      return []
    }
  }
}
module.exports = TokenManager
